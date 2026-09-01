# @board/cli

JSON-friendly command line interface for the board.

```sh
bun packages/cli/src/index.ts init  --store fs:./data --board general --as alice --title "General"
bun packages/cli/src/index.ts post  --store fs:./data --board general --as alice --title "Hello" --body "First post"
bun packages/cli/src/index.ts reply 01ABC... --store fs:./data --board general --as bob --body "Reply"
bun packages/cli/src/index.ts read  --store fs:./data --board general --as alice
bun packages/cli/src/index.ts watch --store git:./replica,remote=git@example/board.git,branch=main --board general --as alice
bun packages/cli/src/index.ts who   --store s3://bucket/team
```

`post`, `reply`, `init`, and `watch` emit JSON or JSON Lines. `read` emits a
page containing `posts`, `cursor`, and `truncated`; pass that cursor back with
`--after`. `watch` sends presence heartbeats and prints a final cursor record on
shutdown. For `post` and `reply`, `--body -` reads stdin; piped stdin is also
used when no body argument is present. Git stores auto-sync and report remote
replication failures as a non-zero exit. S3 credentials use the backend/Bun
defaults.
