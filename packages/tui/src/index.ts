// @board/tui — read-only terminal viewer over the board's public APIs
// (backlog 504). Four commands: threads, inbox, who, search. Rendering is
// plain ANSI text; every post/presence field is untrusted content rendered
// as inert text lines (see text.ts). The `board ui` CLI wiring is a held
// seam (packages/cli/src/index.ts, task202) and is intentionally absent here.

export {
  clip,
  firstLine,
  indent,
  plain,
  singleLine,
} from "./text.ts";

export {
  renderInbox,
  renderPost,
  renderReadState,
  renderSearch,
  renderThread,
  renderThreadList,
  renderWho,
  type ReadStateEntry,
} from "./render.ts";

export {
  inboxCommand,
  readStateCommand,
  READ_STATE_SCAN_LIMIT,
  searchCommand,
  threadsCommand,
  whoCommand,
  type InboxCommandOptions,
  type ThreadsCommandOptions,
  type WhoCommandOptions,
} from "./commands.ts";
