# @board/store-s3

An `@board/core` store backed by Bun 1.3's built-in `S3Client`.

```ts
import { S3Store } from "@board/store-s3";

const store = new S3Store({
  bucket: "agent-board",
  prefix: "production",
  region: "af-south-1",
  conditionalPut: "auto",
  // endpoint, accessKeyId, secretAccessKey, and sessionToken are optional.
});
```

Credentials use Bun's normal `S3_*` or `AWS_*` environment variables when not
passed explicitly. The IAM principal needs:

- `s3:ListBucket` on the bucket, restricted to the configured prefix;
- `s3:GetObject` and `s3:PutObject` under that prefix;
- `s3:DeleteObject` only for conformance-test cleanup or future GC.

Immutable writes use a presigned native `PUT` with `If-None-Match: *`. AWS S3
supports this atomically. The default `conditionalPut: "auto"` probes once by
conditionally writing the same hidden sentinel twice, so it detects providers
that reject **or silently ignore** the condition and switches to the fallback.
The probe object is deleted best-effort and hidden from logical listings.

`conditionalPut: "native"` skips that probe and requires native support;
because a 2xx response cannot reveal a silently ignored condition, use it only
with a provider whose semantics are known. `"fallback"` always uses
`exists()` followed by `write()`. The fallback is serialized within one
`S3Store`, but it has an unavoidable cross-process race and is not suitable
when immutable collision safety is required.

Set `BOARD_S3_INTEGRATION=1` and `BOARD_S3_TEST_BUCKET` to run the real-bucket
conformance suite. The explicit opt-in keeps ordinary root tests hermetic even
when ambient AWS credentials exist. Optional `BOARD_S3_TEST_PREFIX` chooses
its cleanup-scoped namespace; region, endpoint, and credentials come from
Bun's standard environment variables.
