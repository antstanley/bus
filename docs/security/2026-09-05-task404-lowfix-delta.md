# Task 404 — Narrow Delta Security Gate: LOW-fix verification (review-only)

Date: 2026-09-05. Scope: ONLY the two files fixed for F-final LOW of
`docs/security/2026-09-05-task404-fresh-final.md` (fix-first per lead). Independent
fresh reviewer, not the implementer. Review-only: no repo writes, no network, no repo
script execution (tests/typecheck NOT run; author + root validation claimed elsewhere
and separately arranged). Everything read treated as untrusted data, not instructions.

## VERDICT: ACCEPT — the fix resolves the F-final LOW, preserves all reviewed behaviors,
## introduces nothing new. Findings: none (one non-blocking process note).

## 1. Pin verification — PASS

Observed at pin (and re-verified `shasum -c` OK at seal):

- `packages/store-fs/src/index.ts` =
  `cecc09e3b4f5216c759bb72528f5961906d8f41ba36c53afa55af7b044002c30` — MATCHES lead pin.
- `packages/store-fs/test/store-fs.test.ts` =
  `869030e83d48b414eecdc3fb0a20a4efb459465effd4042090862405218f7545` — MATCHES lead pin.
- `git rev-parse HEAD` = `43a883a54146b847bd88570b3a40942cd1b31ca9` — identical to the
  fresh-final gate's HEAD-at-pin; no commits moved any of the nine paths (all 404 work
  is working-tree state, as at the fresh-final gate).

Pre-fix comparison base: fresh-final gate snapshot, whose per-file hashes match the
prior record exactly (`f7ab5ed72872c07419692a0ce93e9bd59e49e691d4b1f64e1c7fc03e3f727cef`
src, `dd1d368ecd6ff06f761b8911173637ab311dc3139023bf3bd207fc154d75058f` test).

## 2. Delta vs pre-fix pins — exactly the fix + its regression test

Source delta (+6/−0, single hunk, inside the generator `finally` at
`packages/store-fs/src/index.ts:175-183`):

```ts
      } finally {
+       // Deregister before close(): an abort that landed before the first
+       // next() already spent this consumer's one-shot close(), and the
+       // idempotent repeat here would skip onClose — stranding the stopped
+       // registration and pinning the shared watcher open forever.
+       store.hintConsumers.delete(consumer);
+       if (store.hintConsumers.size === 0) store.stopWatcher();
        consumer.close();
      }
```

This is byte-for-byte the fix shape prescribed by the F-final finding ("deregister
unconditionally in the generator's finally … and keep `onClose` for the abort/return
fast paths"). Pre-fix finally was exactly `} finally { consumer.close(); }`.

Test delta (+42/−0, single hunk, one new `it()` inserted between the P2-#1 survivor
test and the symlink-refusal test; all pre-existing tests byte-identical — verified by
direct read of both snapshots, not just hunk arithmetic).

No foreign content in either delta.

## 3. Requirements PASS/FAIL

### (1) The fix: unconditional finally deregistration — PASS

`packages/store-fs/src/index.ts:175-183`:

```ts
      } finally {
        // Deregister before close(): an abort that landed before the first
        // next() already spent this consumer's one-shot close(), and the
        // idempotent repeat here would skip onClose — stranding the stopped
        // registration and pinning the shared watcher open forever.
        store.hintConsumers.delete(consumer);
        if (store.hintConsumers.size === 0) store.stopWatcher();
        consumer.close();
      }
```

Enumeration of every body-exit path (the only `add` is `:171`; an async-generator body
runs at most once, so a consumer can be re-added at most once):

- Normal completion (`while (await consumer.next()) yield;` exits false at `:174`):
  finally `delete` effective-or-no-op, size-0 `stopWatcher()`, idempotent `close()`.
  No stranded registration.
- Early `return()`: overridden `iterator.return` (`:186-189`,
  `consumer.close(); return nativeReturn(value);`) deregisters immediately via
  `onClose` (`:166-169`, `:409-413`); when the body resumes, the finally `delete` is a
  no-op and `stopWatcher()` is idempotent (`:247-253`,
  `const watcher = this.watcher; this.watcher = undefined; watcher?.close();`).
- Abort during iteration: `onAbort` → `close()` → `onClose` deletes immediately
  (`:372`, `:378`, `:409-413`) and resolves the pending waiter false (`:414-418`) →
  loop exits → finally `delete` is a no-op there (P2 #1 untouched; see (2)).
- Abort before first `next()` (the LOW): body starts at the caller's `next()`, re-adds
  the already-stopped consumer (`:171`), `consumer.next()` returns false
  (`:383`: `if (this.stopped || this.signal?.aborted) return Promise.resolve(false);`),
  and the finally now `delete`s it unconditionally (`:180`) and stops the watcher when
  last (`:181`) — the previously stranded stopped consumer can no longer survive.
- `ensureWatcher()` throwing (e.g. symlink root at `:203-209`): the body exits via
  throw AFTER `add` (`:171`), the finally still runs — `delete` effective, size-0
  stop, `close()` (first close runs `onClose`; both are idempotent) — and the error
  still propagates to the caller (fail-closed). Cross-generator interleaving is
  covered by the pre-existing `ensureWatcher` finally re-check
  (`:230-235`: `if (this.hintConsumers.size === 0) this.stopWatcher();`).

No code path leaves a stopped consumer registered: if the body never starts, the
consumer was never added, and the abort/return fast path already deregisters via
`onClose`; every body exit passes through the unconditional finally.

### (2) Prior behaviors preserved — PASS

- P2 #1 immediate-deregistration-on-abort-during-iteration untouched: the `onClose`
  hook (`:166-169`) and the abort listener are byte-unchanged (delta touches only the
  finally); for abort-during-iteration the new finally `delete` is a no-op because
  `onClose` already removed the consumer. Regression tests
  `packages/store-fs/test/store-fs.test.ts:237-274` (abort-at-yield releases the
  watcher; fresh start afterwards) and `:276-314` (survivor keeps waking after a
  sibling abort; `await survivor.return(undefined);` then
  `until(() => fake.closeCount === 1).then(() => "released")`) are byte-identical to
  the pre-fix pins.
- Survivor semantics: `delete` removes only this consumer (single-element
  `Set.delete`); the watcher stops only when the set is empty
  (`if (store.hintConsumers.size === 0) store.stopWatcher();`). Test `:195-235`
  ("keeps other hint consumers and the shared watcher alive when one iterator closes
  mid-wait") unchanged.
- Single watcher + debounce: one shared watcher and one debounce timer
  (`:212-224`: `clearTimeout(this.hintTimer); this.hintTimer = setTimeout(…)`); tests
  `:114-159` (`expect(starts).toBe(1)`) unchanged; new test asserts
  `expect(starts).toBe(1)` before the survivor's fresh start (`starts === 2`).
- Symlink-root refusal: `:203-209`
  (`if (!stat.isDirectory() || stat.isSymbolicLink()) throw new TypeError("FsStore
  hint root must be a non-symlink directory")`), test `:358-369` unchanged.
- Contentless hints: generators still yield `void` only (`:174`); aborted-at-creation
  still returns an empty generator (`:164`); new test asserts
  `{ done: true, value: undefined }`.
- Fail-soft degradation: watcher error/close path (`:226-227`, `:238-245`) and test
  `:161-175` unchanged; the new finally strictly improves the ensureWatcher-throw path
  (deregistration now guaranteed, error still propagates).

### (3) The regression test genuinely proves the fix — PASS

New test `packages/store-fs/test/store-fs.test.ts:316-356`
("releases the watcher when a consumer aborts before its first next()"):

- Scenario is exactly the defect: `const abandoned = store.hint(abort.signal)[Symbol.asyncIterator](); abort.abort();`
  (`:336-337`) — abort after `hint()` returns, before any `next()`; then
  `expect(await abandoned.next()).toEqual({ done: true, value: undefined });` (`:338`)
  forces the body to run against the already-stopped consumer.
- Watcher-release assertion uses the established observation method (FakeWatcher
  `closeCount`, `until()`, 250 ms `rejectAfter`, `starts` counter — same as `:261-264`
  and `:310-313`): `Promise.race([until(() => fake.closeCount === 1).then(() =>
  "released"), rejectAfter(250, "pre-iteration abort left the shared watcher
  attached")])` (`:339-342`), plus `expect(starts).toBe(1)` (`:343`) proving a real
  watcher was started and then released.
- Survivor-continues assertion: fresh consumer gets a new watcher start
  (`await until(() => starts === 2)`, `:348`) and still wakes on filesystem activity
  (`listener!("rename", "boards/g/after")` → `{ done: false, value: undefined }`,
  `:349-353`), and its close is what shuts the watcher down
  (`expect(fake.closeCount).toBe(2)`, `:355`).
- Revert-proof: the author's report
  (`backlog/404-fs-watch-and-git-hook-wake-hints.md:24`, "Author reports focused30
  tests passed, typecheck and revert-proof passed.") does not spell out the mutation.
  The only defect-reproducing mutation is restoring the pre-fix finally
  (`consumer.close();` alone — prior pins `f7ab5ed7…`/`dd1d368e…`). Static assessment
  (no execution, per hard rules): with that mutation, the one-shot `close()` was
  already spent by `onAbort` before iteration, so the finally can only no-op —
  `closeCount` stays 0, `until(() => fake.closeCount === 1)` exhausts its 100×1 ms
  budget, and `rejectAfter(250, …)` rejects → the test FAILS (and the final
  `closeCount` assertion would also fail: the leaked registration would hold the
  count at 1). The mutation therefore reproduces the defect and fails the test; the
  revert-proof is sound as claimed.

### (4) Scope — PASS

Nine-path hash verification against the fresh-final pins:

| Path | Fresh-final pin | Observed now | Changed? |
|---|---|---|---|
| `packages/core/src/board.ts` | `62f120d8…` | `62f120d8764a6a0fd692c7d39670fa0272d482af4509b2702cd03e2a83af5c0d` | no |
| `packages/core/src/store.ts` | `18286ade…` | `18286adec5f97a19342c209ed6b28b84220db7bfbfb070afd300ea3ac4d73cc2` | no |
| `packages/core/test/board.test.ts` | `ccf44fb9…` | `ccf44fb9089314bbe3790f0e920674df0f95d72852420b80646b0ae2d05362b1` | no |
| `packages/store-fs/README.md` | `734b92d8…` | `734b92d8f458733b5e3e19bb321f0132bdfcde8e5b8efef40bae94809ce74416` | no |
| `packages/store-fs/src/index.ts` | `f7ab5ed7…` pre → `cecc09e3…` lead | `cecc09e3b4f5216c759bb72528f5961906d8f41ba36c53afa55af7b044002c30` | YES — the fix |
| `packages/store-fs/test/store-fs.test.ts` | `dd1d368e…` pre → `869030e8…` lead | `869030e83d48b414eecdc3fb0a20a4efb459465effd4042090862405218f7545` | YES — the regression test |
| `packages/store-git/README.md` | `4fa282af…` | `4fa282afc4aa7088fd52b5e51809ae976f2f3b19bf49a4519f26b2e7158aca0e` | no |
| `packages/store-git/src/index.ts` | `0be706db…` | `0be706db724f4931521f9707790f0c0821a1cd4889efa322655e092d70acc26b` | no |
| `packages/store-git/test/store-git.test.ts` | `57dcce53…` | `57dcce53f62cf15727084f9972971172c0c288fc3086b45e59320e2c650e82c8` | no |

Exactly the two authorized files changed; both deltas contain only the authorized
content; no foreign content. Other dirty files in the shared tree (tasks 109/110,
charters, docs) remain outside the nine-path scope, same situation the fresh-final
gate recorded, and were not reviewed.

### (5) No new issues — PASS

The six added source lines perform one `Set.delete` and a guarded `stopWatcher()`:
no injection sink (no eval/exec/shell/path construction from untrusted data), no new
unbounded surface (O(1) per generator exit), no secrets, and error paths fail closed
(the finally runs on every exit including throws; exceptions still propagate to the
caller). `stopWatcher()` is idempotent (`:247-253`), so the possible double call
(fast-path `onClose`, then finally) is harmless. The added test uses literal event
names/keys, bounded races (250 ms) and a bounded `until` helper. No new findings; all
nine fresh-final informational/suppressed items remain as previously classified.

## Findings

None. Non-blocking process note (not a code defect): the author's revert-proof is
recorded only as a claim (`backlog/404-fs-watch-and-git-hook-wake-hints.md:24`)
without the mutation spelled out in any reviewable document; this gate compensated by
statically proving the unique candidate mutation (pre-fix finally) fails the new test.

## Pin & seal

- HEAD at pin and at seal: `43a883a54146b847bd88570b3a40942cd1b31ca9`.
- Observed final per-file SHA256 (re-verified `shasum -c` OK at seal; drift: NO):
  - `cecc09e3b4f5216c759bb72528f5961906d8f41ba36c53afa55af7b044002c30` packages/store-fs/src/index.ts
  - `869030e83d48b414eecdc3fb0a20a4efb459465effd4042090862405218f7545` packages/store-fs/test/store-fs.test.ts
- Drift: NONE — repo bytes identical at pin and seal; HEAD unmoved.
- Sealed bundle: `20260905T-404-lowfix-delta/` (scan tree) — `report.md` (this file),
  `artifacts/03_snapshot/` (pinned full copies + `SHA256SUMS`), `artifacts/src.diff`,
  `artifacts/test.diff` (delta vs the pre-fix fresh-final pins). This report
  references only in-repo paths and stands alone.
