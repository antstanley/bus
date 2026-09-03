# Benchmarks

Append-only record of local benchmark runs. Newest section last.

## 405 — day snapshots, compaction, retention

- run: 2026-09-02T21:52:32.555Z, bun 1.3.14, darwin arm64, Apple M2, 8 cores, 8 GiB RAM
- posts: 1,000,000 across 10 day buckets (100,000/day, 10% replies), fs store in a temp dir
- method: generated with one synchronous writeFileSync per post (no fsync; the async write fan-out this replaced wedged on a space-starved volume); compactBoard writes boards/bench/snapshots/<day>.jsonl for the 9 closed buckets; retainBoard collects buckets older than 2 days; BoardIndex.rebuild is timed with snapshots (default) and, as a control, with useSnapshots: false before retention runs

| phase | wall | object reads | detail |
| --- | ---: | ---: | --- |
| generate | 93.7 s | — | 1000000 posts in 10 buckets |
| compact | 112.5 s | 1,800,018 | 9 snapshots, 900000 posts, 9 verified, 1800018 object reads |
| rebuild (control, live-only) | 84.9 s | 1,000,000 |  |
| retain | 114.9 s | 700,014 | deleted 700000 objects across 7 days |
| rebuild (snapshots) | 39.0 s | 300,009 |  |

- snapshot rebuild = 39.0 s (limit 60 s) with 300,009 object reads for 9 snapshot files + a 300,000-post live tail, vs 84.9 s and 1,000,000 reads live-only (2.2× faster, 3.3× fewer reads): the 700,000 snapshotted posts that retention collected are never re-read, so the store-read cost is O(days + live tail), not O(posts)
- assertions: rebuild under 60 s; closed buckets not re-read; index holds every post, thread, and a sampled snapshot thread
