# Quick Focused Security Re-Scan — task 201 size-guard regate

- **Scope**: the 64 KiB encoded-size fix in `packages/core` (uncommitted working tree of
  /Volumes/Delorean/code/sidekick/tmp), review-only. Nothing outside `packages/core` edited or in scope,
  except a read-only check of the `DESIGN.md` URI note (explicitly requested, verify point 5).
- **Repo HEAD at pin**: `809cd87d8fd7932756db55814bf55f3b4ebf9f13` (201 uncommitted; tree IS the fix state).
- **Method**: pinned the 7 changed files into `artifacts/03_snapshot/` (SHA256SUMS-sealed), diffed against the
  prior sealed gate snapshot (`20260903T-201-envelope-v2-gate/artifacts/03_snapshot/`) to isolate the fix,
  reviewed pinned copies statically only. No installs, builds, or tests executed; no repo writes.

## VERDICT: ACCEPT

The fix is correct and complete: the single LOW finding from the gate (fromCloudEvent missing the 64 KiB
guard) is closed via the shared guard, no post-producing path bypasses it, and the fix's extra changes are
sound. Zero blocking findings; 4 informational notes (below), 0 suppressed defects.

## Verify points

1. **PASS** — `fromCloudEvent` now runs the shared guard on the post it produces:
   `src/cloudevents.ts:188-192` (`validatePost(p)` then `checkEncodedSize(encoder.encode(encodePost(post)))`),
   guard defined at `src/post.ts:253-255` (`byteLength > LIMITS.maxBytes` = 64·1024, throws `InvalidPostError`),
   imported at `src/cloudevents.ts:55`.
2. **PASS** — complete inventory of post-producing paths, all bounded on the same encoded form
   (UTF-8 `byteLength` of canonical JSON + trailing `\n`, same `TextEncoder` singleton from `src/store.ts:69`):
   - `parsePost` — `src/post.ts:344-345`: guard first, on the raw stored bytes.
   - `Board.write` — `src/board.ts:154-156`: `validatePost` then guard on the exact bytes stored (:157);
     `Board.post` (:83), `Board.reply` (:88), `Board.request` (:101) all funnel through it.
   - `fromCloudEvent` — `src/cloudevents.ts:191`.
   - Read paths (`Board.get` :173, `loadOne` :292, `since` :185, `scan` :195, `reconcile` :219, `watch` :230)
     all parse via `parsePost` (guarded). `toCloudEvent` (:101) consumes a post (serialization, not production).
   - *Note (INFO-1)*: exported `validatePost` (`src/post.ts:257`) returns a Post without a size check — by
     design it is the shared schema core; every trust-boundary producer wraps it with the guard. Future
     callers must not use it alone as a producer.
3. **PASS** — `test/cloudevents.test.ts:120-126`: fixture `toCloudEvent(v1Post())` (valid v1 post,
   :36-49; fixture ULID `01K46Q1234567890ABCDEFGHJK` decodes to 1756867102820 ms = its own `ts`, so the
   rejection is attributable solely to the size guard), payload `data = { blob: "x".repeat(65536) }`
   (passes schema/depth validation, fails only the size bound), assertions target `fromCloudEvent`
   throwing `/larger than 65536 bytes/` AND `InvalidPostError`. Static read only; tests not executed.
   Companion oversize coverage: read side `test/post.test.ts:192-193`, `test/board.test.ts:175-177`;
   write side `test/board.test.ts:295-296`.
4. **PASS** — no regression: one guard definition wired identically at exactly three call sites
   (`post.ts:345`, `board.ts:156`, `cloudevents.ts:191`); error type uniformly `InvalidPostError`
   (new `names()`/`invalidKey` routing `board.ts:345-347` / `post.ts:242-245`). Five gate foci re-checked:
   - enum fail-closed: `post.ts:299` (act), `:305-310` (status + act binding), closed sets :33-50;
     CloudEvent type→act funnel `cloudevents.ts:146-150` (incl. `board.post.` / nested suffix); tests
     `post.test.ts:94-117`, `cloudevents.test.ts:131-133`.
   - unknown top-level key rejection incl. v1 compat: `post.ts:262-264` + KNOWN_KEYS :176-181; v1 posts
     validate unchanged (:261, all v2 checks `!== undefined`-guarded, byte invariant `post.test.ts:41-72`);
     new skip-not-crash test `board.test.ts:191-208`.
   - depth/size caps reach into data/origin/ext: depthOf over the whole object (`post.ts:259`, :208-213);
     size bound covers total encoded bytes at all three call sites; tests `post.test.ts:182-196`,
     `board.test.ts:179-181`.
   - CloudEvents round-trip validation funnel: `fromCloudEvent` → `validatePost` → size guard;
     byte-identical v1/v2 round-trips, foreign extension attrs dropped (`cloudevents.test.ts:52-118,147-152`).
   - task-115 ts/id/key-binding limits intact: `post.ts:271-279`; tests `board.test.ts:160-189` (wrong key,
     future id, skewed ts), `:210-216` (key binding).
   - `test/post.test.ts` and `test/board.test.ts` read-side tests: `post.test.ts` byte-identical to the
     sealed gate snapshot (no diff); `board.test.ts` changes are additive tests only.
5. **PASS** — extra changes sound: empty-recipients throw `board.ts:104` (static message, fail-closed,
   tested `board.test.ts:254-255`); uniform `InvalidPostError` via `invalidKey` (:242-245) passes
   non-key errors through unchanged, messages charset-bounded by `assertName` (no newline/injection
   channel; cf. `board.test.ts:50-56`); `checkEncodedSize` message is static; DESIGN URI note
   (`DESIGN.md:140-143`) accurately documents the any-scheme URI regex (`post.ts:229` — `javascript:`/
   `file:` accepted) and warns bridges/consumers never to dereference — honest, matches the trust model
   (post content is data, not instructions).

## Findings

None blocking. Informational notes (not defects introduced by the fix):

- **INFO-1** — `src/post.ts:257` (`validatePost`): exported and returns a Post without enforcing
  `checkEncodedSize`; safe today because every trust-boundary producer wraps it with the guard, but a
  future producer calling `validatePost` alone would bypass the limit. Fix (hardening): document the
  wrap-with-guard contract at the `validatePost` docstring, or fold the guard into a single produce helper.
- **INFO-2** — `src/cloudevents.ts:188-192`: the size check necessarily runs after `validatePost`, so a
  hostile caller-supplied event object is schema-walked and canonicalized before the bound applies; the
  input was already parsed in caller memory, so no new DoS bound is crossed (unchanged from gate era).
- **INFO-3** (out of post scope, pre-existing, unchanged) — `src/board.ts:310-326` (`Board.info`) folds
  untrusted BoardEvent JSON with no size/depth caps; events are not posts and were outside both gates.
- **INFO-4** (pre-existing, unchanged, not on the fix's changed lines) — `post.ts:299,314,317,322`
  interpolate attacker-controlled values (act/contentType/dataSchema/extension) raw into
  `InvalidPostError` messages; log-forging risk only if a caller logs `err.message` verbatim.

Suppressed count: **0** suppressed defects; the 4 INFO notes above were considered and deliberately not
raised as findings (pre-existing and/or out of the fix's changed lines, none crosses a trust boundary).

## Pin + drift

- Snapshot sealed at `artifacts/03_snapshot/SHA256SUMS` (7 files); re-verified `shasum -c` → all OK
  before finalizing.
- Drift: pinned copies re-diffed against the working tree at review end → byte-identical (0 drift);
  `git status --porcelain -- packages/core` unchanged from pin time (4 modified, 3 untracked; no new
  modifications). Repo HEAD unchanged: `809cd87d8fd7932756db55814bf55f3b4ebf9f13`.
- Reference diff base: prior sealed snapshot `20260903T-201-envelope-v2-gate/artifacts/03_snapshot/`
  (`post.test.ts` and `src/index.ts` identical between gates; fix touches exactly: guard call swap in
  `post.ts`/`board.ts`, guard added in `cloudevents.ts`, `names()`/empty-recipients in `board.ts`,
  `checkEncodedSize`/exported `invalidKey` in `post.ts`, additive tests in `board.test.ts`/`cloudevents.test.ts`).

## Not checked

- Tests were reviewed statically only (execution forbidden by the re-scan rules) — behavioral confirmation
  of the oversize rejection rests on code reading plus the existing passing gate run.
- `src/store.ts`, `src/keys.ts`, `src/ulid.ts` are outside the pinned set; used as read-only references
  after confirming via `git status` they are unmodified vs HEAD (encoder = shared `TextEncoder`).
- `packages/cli`, `packages/hooks`, `DESIGN.md` rest-of-diff, and anything else outside `packages/core`:
  out of scope per the re-scan mandate (DESIGN.md touched only for the explicitly requested URI note).

## Seal

Bundle: `/Volumes/Delorean/code/security-scans/sidekick-tmp/20260903T-201-sizeguard-regate/`
Sealed by regenerating `artifacts/03_snapshot/SHA256SUMS` at pin time and a bundle-wide
`SHA256SUMS.bundle` after this report was written; see `SEAL.md`.
