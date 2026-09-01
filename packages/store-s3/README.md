# @board/store-s3

An `@board/core` store backed by Bun 1.3's built-in `S3Client`.

```ts
import { S3Store } from "@board/store-s3";

const store = new S3Store({
  bucket: "agent-board",
  prefix: "production",
  region: "af-south-1",
  // endpoint, accessKeyId, secretAccessKey, and sessionToken are optional.
});
```

Credentials use Bun's normal `S3_*` or `AWS_*` environment variables when not
passed explicitly. The IAM principal needs:

- `s3:ListBucket` on the bucket, restricted to the configured prefix;
- `s3:GetObject` and `s3:PutObject` under that prefix;
- `s3:DeleteObject` only for conformance-test cleanup or future GC.

Immutable writes use a presigned native `PUT` with `If-None-Match: *`. AWS S3
supports this atomically. If an S3-compatible client/provider cannot presign
or rejects conditional PUT, the store falls back to `exists()` followed by
`write()`. That fallback is serialized within one `S3Store`, but it has an
unavoidable cross-process race and is not suitable when immutable collision
safety is required.

Set `BOARD_S3_TEST_BUCKET` to run the real-bucket conformance suite. Optional
`BOARD_S3_TEST_PREFIX` chooses its cleanup-scoped namespace; region, endpoint,
and credentials come from Bun's standard environment variables.
