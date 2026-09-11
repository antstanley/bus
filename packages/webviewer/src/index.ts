// @board/webviewer — static snapshot viewer over a store export
// (backlog 504). Reads boards/<board>/snapshots/<day>.jsonl objects through
// the generic Store interface (fs and S3 layouts share the key space) and
// renders one self-contained, inert HTML file: no scripts, no event
// handlers, no external assets, all board content HTML-escaped. The
// `board ui` CLI wiring is a held seam (packages/cli/src/index.ts, task202);
// the package-local entry is src/cli.ts.

export { renderHtml, escapeHtml, type HtmlOptions } from "./render.ts";
export {
  listSnapshotKeys,
  loadSnapshotModel,
  readSnapshotDay,
  type SnapshotDayContent,
  type SnapshotKey,
  type SnapshotModel,
  type SnapshotModelOptions,
  type SnapshotThread,
} from "./snapshot.ts";
export {
  runWebviewerCli,
  WebviewerUsageError,
  type WebviewerCliDependencies,
  type WebviewerCliResult,
} from "./cli.ts";
