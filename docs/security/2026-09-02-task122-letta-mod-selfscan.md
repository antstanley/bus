# Self-Scan Report — task 122 letta-mod fixes (working-tree diff vs HEAD)

- Scan: `20260902T-122-letta-mod-selfscan`
- Target: `/Volumes/Delorean/code/sidekick/tmp`, uncommitted working-tree diff vs HEAD `2a13bcb7c8a7e95392210709b746e952098a96cf`, restricted to four in-scope files
- In-scope files (sha256 pinned at scan start 2026-09-02T18:16:48Z in `artifacts/03_snapshot/SHA256SUMS`):
  - `packages/letta-mod/board.ts` `d239acb10e02ff0c82474e70b51fd1f3c6f9f740649d06d68543e561167ddfe6`
  - `packages/letta-mod/board.test.ts` `97067d4fd64d6433e650967e124036ad76487b1042a501850d5df11c230db5b3`
  - `packages/letta-mod/README.md` `d75b790275660a28e26d63cff30a60e13fcf3c581ca6d9cd3c8759ed2b9ccaed`
  - `docs/research/06-letta-mod-timer-wake-finding.md` `bcc45b2dfa9ea6d301b30ce729c8f39a8427915281759f22c1a210067db2af6b`
- Threat model: authoritative `docs/research/04-trust.md`, copied unaltered to `artifacts/01_context/threat_model.md` (store fully untrusted; content that steers an agent is a shell exploit; co-located prompt-infected agents in scope; same-user local processes and operator-owned `~/.board/config.json` out of scope). No SECURITY.md in the repository (`security_guidance.md` is empty).
- Method: full-file deep review of all four in-scope files plus the scoped diff; candidate discovery → validation → disposition ledgers (see `artifacts/02_discovery/` and `artifacts/05_findings/`); runtime validation `bun test packages/letta-mod/board.test.ts` → 8 pass / 0 fail (bun 1.3.14); type-contract checks against the installed `@letta-ai/letta-code` harness types.
- Canonical bundle: `scan-manifest.json` (sealed), `findings.json` (0 reportable), `coverage.json` (complete), and the deterministic projection `report.md`.

## Focus verdicts

### 1. Spawning (bun-path resolution, execFile argv, bounded output, timeout, signal) — PASS

`board.ts:108-136`: `execFile(bunPath(), [script(), ...args], { timeout: spawnTimeoutMs(), signal, maxBuffer: 4MiB })` with no `shell` option — direct `execve` on POSIX, so the bun path is a single argv element and cannot be split, interpolated, or re-parsed; shell metacharacters in `BOARD_BUN`/config `bun` stay literal and, worst case, yield a spawn error (fail-closed). Output bounded at 4 MiB; timeout bounded to [100, 60000] ms (invalid/sub-100 values → 10 s default); `ctx.signal` threaded into every spawn. Validated candidates: c2 (dash-prefixed `--body` value is a parser-level edge that fails closed — no execution path), c3 (timeout floor semantics preserve the effective [100,60000] range). Evidence: hanging-hook test kills the child via the 300 ms knob and the turn proceeds (test passes).

### 2. Injected content (unframed additions, truncation, splicing) — PASS

`board.ts:264-284`: the only content the mod adds to the model context is the hook's stdout, appended verbatim as one typed text part — the `UNTRUSTED CONTENT` framing and 4 KiB cap remain solely in the hook (verified against HEAD `board-hook.ts` `renderPosts`: `<board-messages>` block, per-author labeling, byte cap, per-line quoting). The typed-parts normalization is lossless: array content → append; non-empty string → `[{text: existing}, part]` (existing text preserved verbatim, never truncated); only malformed/empty host content is replaced by the framed part. Nothing attacker-controlled is spliced outside the framed block. Output text passes through unmodified; if hook output ever exceeded maxBuffer, the spawn errors and `spawnHook` degrades to "" (no injection). Evidence: tests assert original text intact ("array start" stays part 0 of 2) and framing present.

### 3. Error paths (ENOENT message contents, generic failures) — PASS

`board.ts:113-127`: the ENOENT branch interpolates only `bunPath()` — which reads solely `process.env.BOARD_BUN ?? config.bun` (operator-owned per threat model), so naming it leaks nothing in scope. Every other failure rejects with `board command failed(code)` where `code` is Node's numeric exit code or short errno string; `stderr` is discarded (the callback never reads it); no store spec, post body, title, mentions, or argv reaches any error output. Misclassification risk checked: spawn ENOENT can only mean executable lookup failure here (no `cwd` option is set). Validated candidate c1 (suppressed).

### 4. Config/env surface (precedence, validation, traversal, secrets) — PASS

Precedence is consistently `env > config > compiled-in default` across all `BOARD_*` overrides including the new `BOARD_REPO`, `BOARD_BUN`, and `BOARD_SPAWN_TIMEOUT_MS` (`board.ts:66-96, 43-61`); README documents exactly this order and it matches the code. Numeric knobs are validated and bounded: `spawnTimeoutMs` → `Number.isFinite` + ≥100 gate + 60 s cap (effective range [100,60000]); `maxAgeMs` → `Number.isFinite` + clamp [0, 3600000] with floor, and 0 now reaches the CLI argv as `"0"` (previously `Number(x) || 120000` silently rewrote it — test asserts the fix). Path-valued knobs (`repo`, `bun`) become single argv elements only; no traversal beyond what the operator already controls by owning the config/env. Test fixtures write only under `mkdtemp(tmpdir())` roots and introduce no secrets. Validated candidate c5 (suppressed).

### 5. Tests/docs (injection-prone patterns, secrets, claim accuracy) — PASS

`board.test.ts`: no injection-prone patterns; the fake CLI/hook sources are test-authored constants (`echo` of argv, `setInterval`) executed in temp dirs; env is saved/restored around each mod load; no secrets or credentials. Runtime: 8/8 pass. `README.md`: every documented behavior checked against code — bun requirement and missing-bun behavior, silent hook degradation, `BOARD_REPO` override, boards first-entry behavior for post/read vs full-list turn_start delivery, timeout range — all match; no secrets. `docs/research/06`: prose-only correction; the load-bearing claim was verified against the cited artifact on this machine — `ModTurnEndResult { continue?: string }` exists in the installed harness at `dist/types/mods/types.d.ts:201-203`, mapped to `turn_end` at line 264 — so the corrected claim matches the cited harness types; no secrets, no executable content.

## Findings

None reportable. Five candidates were discovered and closed at validation as suppressed or not applicable with receipts in `artifacts/05_findings/<candidate_id>/candidate_ledger.jsonl` (c1 error-message surface, c2 argv flag-value parse edge, c3 timeout floor semantics, c4 content replacement branch, c5 non-finite maxAgeMs fallback) — each is a bounded, fail-closed behavior inside the operator/local trust boundary, none is a defect introduced or exposed by this diff.

## Gate discipline — snapshot re-verification (close of scan)

Re-hashed the four in-scope working-tree files at close (2026-09-02T18:32Z) and compared with `artifacts/03_snapshot/SHA256SUMS` (pinned 2026-09-02T18:16:48Z), order-insensitive:

- `packages/letta-mod/board.ts` → `d239acb10e02ff0c82474e70b51fd1f3c6f9f740649d06d68543e561167ddfe6` ✅ unchanged
- `packages/letta-mod/board.test.ts` → `97067d4fd64d6433e650967e124036ad76487b1042a501850d5df11c230db5b3` ✅ unchanged
- `packages/letta-mod/README.md` → `d75b790275660a28e26d63cff30a60e13fcf3c581ca6d9cd3c8759ed2b9ccaed` ✅ unchanged
- `docs/research/06-letta-mod-timer-wake-finding.md` → `bcc45b2dfa9ea6d301b30ce729c8f39a8427915281759f22c1a210067db2af6b` ✅ unchanged

Result: **IDENTICAL — no drift in scan scope; the reviewed snapshot is the reviewed content.** (The snapshot digest recorded in the manifest covers the whole dirty worktree, which includes the concurrent out-of-scope task's files and may drift there; the four in-scope pins above are authoritative for this scan.) The sealed canonical bundle itself validates clean post-seal (`validate_scan_contract.py`: status `valid`); this file is an unsealed deliverable, so it can record post-seal events.

## Overall verdict

**ACCEPT** — no reportable security findings; the five foci all pass.
