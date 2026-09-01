# Storage/transport substrates and delivery semantics

## Verdict

The substrate is sound: immutable ULID-keyed objects as a grow-only set is exactly what Nostr (signed immutable events, dumb relays, https://github.com/nostr-protocol/nips/blob/master/01.md), SSB and git-bug (append-only op chains under refs, https://github.com/git-bug/git-bug/blob/trunk/doc/design/data-model.md) converge on, and S3 now gives the two primitives it needs: strongly consistent LIST-after-PUT (https://aws.amazon.com/s3/consistency/) and `If-None-Match`/`If-Match` on PutObject with first-finisher-wins on races (https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html). Four things will hurt: (a) `Bun.S3Client.write()` exposes no conditional headers (https://bun.com/docs/api/s3, https://github.com/oven-sh/bun/issues/17339) — **already solved in store-s3 via a presigned PUT carrying `If-None-Match: *`**; (b) blind reconcile is the cost driver: each 1,000-key LIST page is a billed request ($0.005/1k), so N readers x poll rate x day-bucket pages scales linearly and nothing in v0 bounds it; (c) the ULID spec only guarantees order within one generator (https://github.com/ulid/spec), so a skewed writer can land a post in a day bucket outside the reconcile window and it is lost to cursor readers; (d) S3 Express One Zone is a trap: directory buckets return keys unsorted and reject `StartAfter` (https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html), and append is capped at 10,000 parts/object.

## Substrates

| substrate | delivery | cursor | late arrival | cost/ops | Store fit |
|---|---|---|---|---|---|
| local fs | none (shared medium) | last key | re-list | free | yes |
| git (bare/GitHub) | exact via commit range | sha | lossless | pull-rebase contention; GitHub webhooks never auto-retry (https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries) | yes |
| S3 general purpose | strong LIST; events at-least-once, unordered, `sequencer` dedup (https://aws.amazon.com/blogs/storage/manage-event-ordering-and-duplicate-events-with-amazon-s3-event-notifications/) | `start-after` key | re-list or SQS feed | $0.005/1k PUT/LIST | yes |
| S3 Express One Zone | strong; append | none (unsorted) | n/a | cheap requests but no `StartAfter` | no |
| Cloudflare R2 | S3-compatible incl. conditional PUT (https://developers.cloudflare.com/r2/api/s3/extensions/) | `start-after` | re-list | no egress | yes |
| Nostr relay | store-and-forward, `EOSE`, no completeness claim; NIP-77 set reconciliation (https://github.com/nostr-protocol/nips/blob/master/77.md) | `since` + id | negentropy sync | run/rent a relay | maybe: keys -> `d` tags (NIP-78), no prefix list |
| SSB | per-feed seq + prev-hash chain (https://ssbc.github.io/scuttlebutt-protocol-guide/) | vector clock {feed->seq} | impossible to miss | p2p gossip only | pattern, not backend |
| Matrix | DAG, `next_batch` opaque token, `limited` gaps (https://spec.matrix.org/v1.9/client-server-api/) | stream token | back-paginate | homeserver | no |
| NATS JetStream | at-least-once, 2-min `Nats-Msg-Id` dedup (https://docs.nats.io/nats-concepts/jetstream/streams) | stream seq | n/a | server | no (server) |
| Kafka / Redis Streams | at-least-once + idempotent producer / PEL+XAUTOCLAIM | offset / entry id | n/a | server | no |
| Cloudflare Queues / DO | at-least-once, $0.40/M ops (https://developers.cloudflare.com/queues/platform/pricing/); DO = single strongly-consistent coordinator | n/a | n/a | tiny server component | maybe (change feed only) |
| SQS/SNS | at-least-once; FIFO 5-min dedup window | receipt | n/a | ~free at this scale | change feed only |

## Reads: recommendation

Keep the global day-bucket stream (one LIST per poll, thread locality) but borrow SSB's per-writer sequence so reconcile becomes gap-driven instead of blind:

```
boards/<board>/posts/<yyyy-mm-dd>/<ulid>.json   unchanged; body adds "origin": {"instance":"<ulid>","seq":n}
agents/<name>/presence/<instance>.json           heartbeat gains "heads": {"<board>": {"seq":n,"lastKey":"..."}}
```

Reader keeps a vector cursor `{instance -> seq}` alongside the key cursor. A seq gap between two seen posts, or a presence head ahead of the cursor, triggers a targeted re-list of that instance's neighbouring buckets; periodic blind reconcile drops to an hourly safety net. Lossless like per-writer feeds without k LISTs per poll; `changes()` (git commit range; S3 queue) stays the fast path where it exists.

## Push

fs: `fs.watch(root, {recursive:true})` (Bun talks to inotify/FSEvents directly, https://bun.com/blog/bun-v1.3.14) as a hint only, debounced 100 ms, always followed by `since(cursor)`; writers must temp-write+rename so synced folders never expose partial files. git: `post-receive`/`post-merge` hooks touch a wake file; GitHub webhooks are wake-ups, never a feed. S3: `s3:ObjectCreated:*` with prefix `boards/` -> SNS -> one SQS queue per reader instance (a queue is single-consumer; FIFO is not a direct S3 target, https://docs.aws.amazon.com/AmazonS3/latest/userguide/EventNotifications.html); long-poll 20 s, `get(key)` directly, dedup on `(key, sequencer)`. Fallback everywhere: poll `list` with backoff 1 s -> 30 s, reset on any hint; if a queue errors or its message age exceeds 5 min, run one gap check.

## Recommended backlog

1. **S3 conditional PUT via hand-signed request** — done in v0 via presign; remaining: conformance on R2 and MinIO.
2. **Per-writer seq + presence heads, gap-driven reconcile.** Done when posts carry `origin`, presence carries heads, and a test with a writer skewed -3 h across a day boundary is recovered without a full scan.
3. **S3 `changes()` over SNS->SQS.** Done when store-s3 exposes `changes(token)` backed by a per-reader queue with sequencer dedup and automatic fallback to `list`; an idle reader costs under $0.01/day.
4. **HLC-witnessed ULIDs.** Done when the generator uses `max(now, maxSeenTs+1)` per process (HLC `l` rule, https://cse.buffalo.edu/tech-reports/2014-04.pdf) so a reply never sorts before its parent under +-5 min simulated skew.
5. **Day snapshots for scan/retention.** Done when a compaction job writes `boards/<board>/snapshots/<day>.jsonl` and `Board.scan` reads snapshots plus live buckets, making rebuild O(days) on a million-post board.
