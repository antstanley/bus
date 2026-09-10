# Validation — cand-03

Disposition: **suppressed** (no reportable finding).

- Method: static source trace + bounded local fs.watch observation probe (outside the repository)
- Confidence: medium — Static trace plus a real local watcher observation; the CI platform that produced the original undefined filename was not reproduced.
- Evidence: Probe (bun 1.4.0, macOS, recursive watch on /tmp): .git writes reported concrete filenames ('rename .git/HEAD', 'rename .git/index'), so the existing .git filter still applies on this platform; no undefined filename observed. The watcher callback returns early when hintConsumers.size===0 and coalesces with hintDebounceMs (default 100ms). The pre-change behaviour for an undefined filename was a TypeError thrown inside the fs.watch callback.
- Counterevidence / proof gap: A wake/read/wake loop would need a platform that reports .git-internal writes with an undefined filename AND a consumer whose own reaction writes into .git with the same undefined reporting. Repository evidence does not show that combination; the change strictly removes a crash for the same input.
- Remaining uncertainty: Bun on Linux CI previously delivered an undefined filename in this project; if that recurs specifically for .git-internal writes the loop hypothesis should be re-checked then.

## Independent verification (clean context)

A second, clean-context file-review worker reviewed the same frozen bytes and
reported the same conclusion with stronger evidence: the `.git` filter still
suppresses all git bookkeeping on the CI runtime (350/350 events carried string
filenames), the only reproducible filename-less event is termination of the
watched root, and `packages/store-fs/README.md` (unchanged) already records the
null/unclassifiable-filename bypass as an accepted performance limitation. The
pre-delta behaviour for a filename-less event was an uncaught `TypeError` in the
`fs.watch` callback; the delta removes that crash.
