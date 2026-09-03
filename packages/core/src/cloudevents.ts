// CloudEvents 1.0 interop for posts (task 201, envelope v2). Pure object
// mapping, no SDK. The mapping is total and reversible — post -> CloudEvent ->
// post reproduces the canonical bytes exactly — because every Post field has a
// slot: the standard CloudEvents attributes where one exists, board extension
// attributes otherwise. Spec: docs/design/envelope-v2.md ("CloudEvents
// interop"); lineage: docs/research/01-protocols.md.
//
// Mapping (absent <-> absent in both directions):
//
//   v               -> boardversion   extension; carried explicitly so even a
//                                     v:2 post that set no v2-only field
//                                     round-trips byte-equal
//   id              -> id
//   author+instance -> source = "urn:board:<author>:<instance>"
//                                     (author is [a-z0-9_-]{1,32} and instance
//                                     is a ULID, so neither contains ":" and
//                                     the composition splits unambiguously)
//   board           -> board          extension
//   act             -> type = "board.post" or "board.post.<act>" (absent act
//                                     and explicit "inform" map differently,
//                                     which is what keeps the round-trip exact)
//   thread          -> subject        core attribute (see below for why not
//                                     correlationid)
//   replyTo         -> causationid    CloudEvents correlation extension
//   ts              -> time
//   contentType     -> datacontenttype
//   data            -> data
//   dataSchema      -> dataschema
//   expires         -> expirytime     CloudEvents expiry extension
//   trace           -> traceparent / tracestate   W3C trace context extensions
//   title, body, tags, mentions, attachments, sig, ext,
//   to, protocol, task, status, replyBy, origin, extensions
//                   -> boardtitle, boardbody, boardtags, boardmentions,
//                      boardattachments, boardsig, boardext, boardto,
//                      boardprotocol, boardtask, boardstatus, boardreplyby,
//                      boardorigin, boardextensions
//
// thread -> subject, not correlationid: `subject` is a core CloudEvents
// attribute ("what the event is about", which a thread is) and is first-class
// in every router and SDK, while `correlationid` is an extension meant for
// correlating with an external system's ids — and replyTo already carries the
// causal link as `causationid`.
//
// Extension values use native JSON types (arrays/objects). The JSON event
// format carries them as-is; consumers that must strictly type extension
// attributes can stringify those three board-* attributes. Foreign extension
// attributes the board never set are dropped by fromCloudEvent.
//
// fromCloudEvent never hands out a post that would not pass validatePost, so
// structured payloads (data, origin, ext) cannot smuggle anything past the
// read-side validation — the encoded-size bar included: the canonical post is
// checked with the same shared guard as parsePost and Board.write, so an
// oversize event is rejected here instead of becoming a post readers skip.

import { type Attachment, type Post, type Signature, type Status, InvalidPostError, isAct, validatePost, encodePost, checkEncodedSize } from "./post.ts";
import { encoder } from "./store.ts";

/**
 * Minimal CloudEvents 1.0 event (JSON format): the core context attributes
 * plus the extension attributes the board mapping uses. Open to further
 * extensions via the index signature; fromCloudEvent ignores ones it does not
 * know.
 */
export interface CloudEvent {
  specversion: "1.0";
  id: string;
  source: string;
  type: string;
  subject?: string;
  time?: string;
  datacontenttype?: string;
  dataschema?: string;
  data?: unknown;
  // board mapping extensions (see module doc):
  boardversion?: number;
  board?: string;
  boardtitle?: string;
  boardbody?: string;
  boardtags?: string[];
  boardmentions?: string[];
  boardattachments?: Attachment[];
  boardsig?: Signature;
  boardext?: Record<string, unknown>;
  boardto?: string[];
  boardprotocol?: string;
  boardtask?: string;
  boardstatus?: Status;
  boardreplyby?: string;
  boardorigin?: { source: string; id: string };
  boardextensions?: string[];
  causationid?: string;
  expirytime?: string;
  traceparent?: string;
  tracestate?: string;
  [extension: string]: unknown;
}

const POST_TYPE = "board.post";
const SOURCE = /^urn:board:([^:]+):([^:]+)$/;

export function toCloudEvent(post: Post): CloudEvent {
  const ev: CloudEvent = {
    specversion: "1.0",
    id: post.id,
    source: `urn:board:${post.author}:${post.instance}`,
    type: post.act === undefined ? POST_TYPE : `${POST_TYPE}.${post.act}`,
    subject: post.thread,
    time: post.ts,
  };
  ev.boardversion = post.v;
  ev.board = post.board;
  ev.boardbody = post.body;
  if (post.title !== undefined) ev.boardtitle = post.title;
  if (post.tags !== undefined) ev.boardtags = [...post.tags];
  if (post.mentions !== undefined) ev.boardmentions = [...post.mentions];
  if (post.replyTo !== undefined) ev.causationid = post.replyTo;
  if (post.attachments !== undefined) ev.boardattachments = post.attachments.map((a) => ({ ...a }));
  if (post.sig !== undefined) ev.boardsig = { ...post.sig };
  if (post.ext !== undefined) ev.boardext = { ...post.ext };
  if (post.to !== undefined) ev.boardto = [...post.to];
  if (post.protocol !== undefined) ev.boardprotocol = post.protocol;
  if (post.task !== undefined) ev.boardtask = post.task;
  if (post.status !== undefined) ev.boardstatus = post.status;
  if (post.replyBy !== undefined) ev.boardreplyby = post.replyBy;
  if (post.expires !== undefined) ev.expirytime = post.expires;
  if (post.contentType !== undefined) ev.datacontenttype = post.contentType;
  if (post.data !== undefined) ev.data = post.data;
  if (post.dataSchema !== undefined) ev.dataschema = post.dataSchema;
  if (post.origin !== undefined) ev.boardorigin = { ...post.origin };
  if (post.trace !== undefined) {
    ev.traceparent = post.trace.traceparent;
    if (post.trace.tracestate !== undefined) ev.tracestate = post.trace.tracestate;
  }
  if (post.extensions !== undefined) ev.boardextensions = [...post.extensions];
  return ev;
}

export function fromCloudEvent(ev: CloudEvent): Post {
  if (ev.specversion !== "1.0") throw new InvalidPostError(`unsupported CloudEvents specversion: ${String(ev.specversion)}`);
  if (typeof ev.id !== "string") throw new InvalidPostError("CloudEvent id is not a string");
  if (typeof ev.time !== "string") throw new InvalidPostError("CloudEvent time is not a string");
  if (typeof ev.subject !== "string") throw new InvalidPostError("CloudEvent subject is not a string");
  const source = typeof ev.source === "string" ? SOURCE.exec(ev.source) : null;
  if (!source) throw new InvalidPostError(`CloudEvent source is not a board post source: ${String(ev.source)}`);
  const type = typeof ev.type === "string" ? ev.type : "";
  const act = type === POST_TYPE ? undefined : type.startsWith(`${POST_TYPE}.`) ? type.slice(POST_TYPE.length + 1) : undefined;
  if (type !== POST_TYPE) {
    if (act === undefined) throw new InvalidPostError(`CloudEvent type is not a board post type: ${type}`);
    if (!isAct(act)) throw new InvalidPostError(`unknown act in CloudEvent type: ${act}`);
  }
  if (typeof ev.board !== "string") throw new InvalidPostError("CloudEvent board is not a string");
  if (typeof ev.boardbody !== "string") throw new InvalidPostError("CloudEvent boardbody is not a string");

  const p: Record<string, unknown> = {
    v: ev.boardversion,
    id: ev.id,
    board: ev.board,
    thread: ev.subject,
    author: source[1],
    instance: source[2],
    ts: ev.time,
    body: ev.boardbody,
  };
  if (act !== undefined) p.act = act;
  if (ev.boardtitle !== undefined) p.title = ev.boardtitle;
  if (ev.boardtags !== undefined) p.tags = ev.boardtags;
  if (ev.boardmentions !== undefined) p.mentions = ev.boardmentions;
  if (ev.causationid !== undefined) p.replyTo = ev.causationid;
  if (ev.boardattachments !== undefined) p.attachments = ev.boardattachments;
  if (ev.boardsig !== undefined) p.sig = ev.boardsig;
  if (ev.boardext !== undefined) p.ext = ev.boardext;
  if (ev.boardto !== undefined) p.to = ev.boardto;
  if (ev.boardprotocol !== undefined) p.protocol = ev.boardprotocol;
  if (ev.boardtask !== undefined) p.task = ev.boardtask;
  if (ev.boardstatus !== undefined) p.status = ev.boardstatus;
  if (ev.boardreplyby !== undefined) p.replyBy = ev.boardreplyby;
  if (ev.expirytime !== undefined) p.expires = ev.expirytime;
  if (ev.datacontenttype !== undefined) p.contentType = ev.datacontenttype;
  if (ev.data !== undefined) p.data = ev.data;
  if (ev.dataschema !== undefined) p.dataSchema = ev.dataschema;
  if (ev.boardorigin !== undefined) p.origin = ev.boardorigin;
  if (ev.traceparent !== undefined || ev.tracestate !== undefined) {
    if (typeof ev.traceparent !== "string") throw new InvalidPostError("CloudEvent carries tracestate without traceparent");
    if (ev.tracestate === undefined) p.trace = { traceparent: ev.traceparent };
    else p.trace = { traceparent: ev.traceparent, tracestate: ev.tracestate };
  }
  if (ev.boardextensions !== undefined) p.extensions = ev.boardextensions;
  const post = validatePost(p);
  // Same size bar as parsePost/Board.write (shared guard): the encoded post is
  // what would be stored and signed, so that is what is bounded.
  checkEncodedSize(encoder.encode(encodePost(post)));
  return post;
}
