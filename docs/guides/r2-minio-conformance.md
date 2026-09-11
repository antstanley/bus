# R2 and MinIO conformance for the S3 store

Status: task 406 implementation guide (written 2026-09-11). Covers
`packages/store-s3/test/minio-real.test.ts` (MinIO) and
`packages/store-s3/test/r2-real.test.ts` (Cloudflare R2), both running the
shared `storeConformance` harness from `@board/core/test/store-conformance`
plus a conditional-put probe against a real provider. R2 live acceptance is
**BLOCKED** pending authorized test account/bucket setup (see below). Product
code (`packages/store-s3/src/index.ts`) was not modified for this task.

## What is covered

- **Full Store contract** (`storeConformance`) on a real provider: round-trips,
  overwrite, ifNoneMatch winner/loser, recursive ordered listing, pagination,
  prefix/after semantics, concurrent distinct and same-key puts, delete.
- **Conditional-put probe** (MinIO and R2 suites, see semantics below): which
  strategy `conditionalPut: "auto"` selects, that `KeyExistsError` surfaces,
  that the winner stays intact, and that internal probe objects never leak
  into `list()` results.
- **MinIO extra**: strict assertion that auto selects the native
  `If-None-Match: *` path against the pinned CI image
  (RELEASE.2025-09-07T16-13-09Z), plus the explicit `native` and `fallback`
  strategies on a real server.
- **R2 extra**: provider-independent atomicity assertions plus a *recorded*
  (not asserted) native-vs-fallback observation, because R2 native
  conditional-write behaviour is currently unverified (see
  [Verification status](#verification-status)).

## Running the MinIO suite locally

`bun test packages/store-s3/test/minio-real.test.ts` resolves its target in
this order:

1. `BOARD_MINIO_INTEGRATION=0` — suite skipped, explicitly disabled.
2. `BOARD_MINIO_INTEGRATION=1` — external MinIO. Requires
   `BOARD_MINIO_TEST_BUCKET`; the store uses `BOARD_MINIO_TEST_ENDPOINT`
   (default `http://127.0.0.1:9000`), `BOARD_MINIO_TEST_PREFIX`
   (default `board-tests/minio`), `BOARD_MINIO_TEST_REGION`
   (default `us-east-1`) and `BOARD_MINIO_TEST_ACCESS_KEY_ID` /
   `BOARD_MINIO_TEST_SECRET_ACCESS_KEY`. Credentials fall back to Bun's
   ambient `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` names, which is what
   CI provides. This is the CI mode.
3. Gate unset — local auto-start with strictly read-only discovery:
   docker or podman with an **already-local** minio image is preferred
   (only the pinned digest; `--pull=never` prevents pulls), otherwise both
   `minio` and `mc` binaries on `PATH`. The suite starts an
   ephemeral server (ephemeral host port, temp data dir), creates a throwaway
   bucket, runs, and removes everything afterwards. If no option exists the
   suite skips with the reason in the test title.

Other gate values skip without discovery.

| Name | Required | Meaning |
|------|----------|---------|
| `BOARD_MINIO_INTEGRATION` | optional | `0` skips, `1` targets external, unset discovers local |
| `BOARD_MINIO_TEST_BUCKET` | external | pre-created bucket |
| `BOARD_MINIO_TEST_ENDPOINT` | optional | default `http://127.0.0.1:9000` |
| `BOARD_MINIO_TEST_PREFIX` | optional | default `board-tests/minio` |
| `BOARD_MINIO_TEST_REGION` | optional | default `us-east-1` |
| `BOARD_MINIO_TEST_ACCESS_KEY_ID` | credential pair | explicit access key |
| `BOARD_MINIO_TEST_SECRET_ACCESS_KEY` | credential pair | explicit secret key |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | fallback pair | ambient credentials if explicit pair absent |

Manual local MinIO, if you want a long-lived instance instead:

```sh
docker run --detach --name board-minio --publish 127.0.0.1:9000:9000 \
  --env MINIO_ROOT_USER=minioadmin --env MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e server /data --console-address :9001
docker exec board-minio mc alias set board-minio \
  http://127.0.0.1:9000 minioadmin minioadmin
docker exec board-minio mc mb --ignore-existing board-minio/<bucket>
BOARD_MINIO_INTEGRATION=1 BOARD_MINIO_TEST_BUCKET=<bucket> \
  BOARD_MINIO_TEST_ACCESS_KEY_ID=minioadmin BOARD_MINIO_TEST_SECRET_ACCESS_KEY=minioadmin \
  bun test packages/store-s3/test/minio-real.test.ts
```

The bucket must already exist in gated mode; the suite writes objects but
never creates buckets.

Binary auto-start uses local `minio` and `mc`, a disposable mc config, and
explicit fixture credentials. It creates the bucket with `mc mb`. This path
has not been exercised locally. Suite-created objects are
cleaned per test; `__board_internal__` probe objects are deleted best-effort
by the store itself (see limitations).

## Running the R2 suite

R2 is hosted, so the suite is env-gated only (no auto-start):

```sh
BOARD_R2_INTEGRATION=1 \
BOARD_R2_TEST_BUCKET=<bucket> \
BOARD_R2_TEST_ENDPOINT=<account S3 endpoint> \
bun test packages/store-s3/test/r2-real.test.ts
```

Environment variable names (values are never printed by the suite):

| Name | Required | Meaning |
|------|----------|---------|
| `BOARD_R2_INTEGRATION` | gate | `1` enables the suite |
| `BOARD_R2_TEST_BUCKET` | with gate | R2 bucket to use |
| `BOARD_R2_TEST_ENDPOINT` | with gate | account S3 endpoint host |
| `BOARD_R2_TEST_ACCESS_KEY_ID` | with gate* | R2 S3 access key ID |
| `BOARD_R2_TEST_SECRET_ACCESS_KEY` | with gate* | R2 S3 secret access key |
| `BOARD_R2_TEST_PREFIX` | optional | key prefix (default `board-tests/r2`) |
| `BOARD_R2_TEST_REGION` | optional | region (default `auto`) |

\* or ambient `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`.

**R2 live acceptance is BLOCKED.** No authorized test account or bucket
exists, so the suite has never run against real R2. Do not claim R2
acceptance until the lead completes the setup list below and a run of this
suite passes in a clean worker.

Setup list the lead needs to provide (names only; provision via the usual
secret channel):

1. An R2 bucket dedicated to tests (or an existing disposable bucket).
2. The account's S3 endpoint host for `BOARD_R2_TEST_ENDPOINT`.
3. An R2 API token scoped to that bucket with object read/write and list
   permission, yielding `BOARD_R2_TEST_ACCESS_KEY_ID` and
   `BOARD_R2_TEST_SECRET_ACCESS_KEY`.
4. A decision where the values live: repository secrets for a CI job
   (mirroring the `live-aws-s3` job pattern in `.github/workflows/ci.yml`)
   or a local env file outside the repo.

## Conditional-put probe semantics

`S3Store.put(..., { ifNoneMatch: true })` must be a create-if-absent atomic
operation. Bun's `S3Client.write` has no conditional headers, so the store
presigns a PUT and sends it with `If-None-Match: *`:

- `native`: presigned PUT with `If-None-Match: *`. `412` maps to
  `KeyExistsError`. `409` (conflict, per AWS guidance) retries with a fresh
  signature up to four attempts. `405`/`501`/`400 NotImplemented` mark the
  provider as unsupported. Explicit `native` mode throws; `auto` falls back.
- `auto` (default): one probe per store instance. The store writes
  `<prefix>/__board_internal__/conditional-put-<uuid>` and immediately writes
  it again with the conditional header. A `412` on the second write proves the
  provider honours the condition, and the result is memoized; a second `2xx`
  would mean the header is silently ignored and the store falls back. Probe
  objects are deleted best-effort and are excluded from `list()` results.
- `fallback`: serialized `exists()` then `write()` per store instance.
  Correct within one store instance; **another process can still win between the two
  calls**, so cross-process immutable safety requires a provider with native
  `If-None-Match: *` support.

The MinIO suite asserts auto selects native against the pinned CI image and
that duplicate puts surface `KeyExistsError` with the original value intact.
The R2 suite asserts the same caller-visible contract regardless of the
selected strategy and logs which one R2 picked for the acceptance record.

## Verification status

- External provider documentation (Cloudflare R2 and MinIO conditional-write
  references) was **not** consulted while authoring: the websearch skill was
  unavailable in the authoring session (no Serper key configured,
  2026-09-11). Everything below replaces doc claims with repo-internal or
  runtime evidence; anything else about provider behaviour is **unverified**.
- Pending CI verification: `minio-conformance.yml` must pass against the
  pinned RELEASE.2025-09-07T16-13-09Z image. Native `If-None-Match: *` support
  is asserted by the suite, not established by an offline skipped run.
- Verified from the repo: the MinIO image pin and container/`mc` procedure in
  `.github/workflows/ci.yml` (`minio-s3` job); the status-code mapping in
  `packages/store-s3/src/index.ts` (`412`, `409`, `405`, `501`, `400`) with
  its AWS `ConditionalRequestConflict` retry comment; `FakeS3` expectations in
  `packages/store-s3/test/s3-store.test.ts`.
- Unverified (no doc access, no live run): MinIO version range that first
  shipped conditional writes; the local `minio` + `mc` auto-start path;
  whether R2 honours `If-None-Match: *` natively or falls back; R2 region
  handling of the `auto` default.
- Not exercised locally: no MinIO image existed on the authoring machine and
  image pulls are forbidden for this task, so the MinIO suite ran here only
  in its skip and gate-misconfiguration paths; CI provides the real run.

## Limitations

- The auto-start path is a test convenience: it never pulls images or
  downloads binaries, so a machine without a local MinIO skips the suite.
  A hard test-process crash can leave the started container (unique
  `board-minio-test-*` name) or a `.minio-data-*` directory under
  `packages/store-s3/test/` behind; remove them manually in that case.
- Fallback-mode concurrency guarantees are per store instance only (product
  behaviour, documented on `fallbackPutIfAbsent`).
- Probe objects under `<prefix>/__board_internal__/` are hidden from the
  logical Store; a provider without DeleteObject permission could retain
  them. CI deletes the run prefix (`mc rm --recursive`) after the suite.
- `minio-conformance.yml` overlaps with the `minio-s3` job in `ci.yml`
  (which runs `s3-real.test.ts` on every push/PR). Consolidation is a lead
  decision; the dedicated workflow exists so MinIO conformance can run and
  be dispatched independently of full CI.

## CI

`.github/workflows/minio-conformance.yml`: a single job that starts the same
digest-pinned MinIO container as `ci.yml`, creates a throwaway bucket, runs
`bun test packages/store-s3/test/minio-real.test.ts` with the gate variables
above, then removes the run prefix and the container (`if: always()`).
Triggers: pushes touching `packages/store-s3/**`, `packages/core/**`,
`bun.lock`, `package.json`, or the workflow file, plus
`workflow_dispatch`. The YAML was validated offline by parsing it with
Python + PyYAML (`yaml.safe_load_all`); no CI run was triggered from the
authoring session.
