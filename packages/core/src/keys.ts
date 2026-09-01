// Key construction and validation. Every user-controlled segment is validated
// so a hostile board or author name can never escape its prefix.

export class InvalidKeyError extends Error {
  override name = "InvalidKeyError";
}

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/;

/** A single path segment: alphanumerics . _ -, no separators, never "." or "..". */
export function assertSegment(s: string, what = "segment"): string {
  if (!SEGMENT.test(s) || s === "." || s === "..") throw new InvalidKeyError(`invalid ${what}: ${JSON.stringify(s)}`);
  return s;
}

/** Board and agent names are stricter: [a-z0-9_-], max 32 chars. */
export function assertName(s: string, what = "name"): string {
  if (!NAME.test(s)) throw new InvalidKeyError(`invalid ${what}: ${JSON.stringify(s)} (use a-z 0-9 _ -, max 32)`);
  return s;
}

export function joinKey(...segments: string[]): string {
  return segments.map((s) => assertSegment(s)).join("/");
}

/** Day bucket in UTC for a ms timestamp: "2026-09-01". */
export function dayBucket(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isDayBucket(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function nextDay(day: string): string {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return dayBucket(d.getTime());
}

export function prevDay(day: string): string {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return dayBucket(d.getTime());
}

// Layout (see DESIGN.md):
//   boards/<board>/posts/<yyyy-mm-dd>/<ulid>.json
//   boards/<board>/events/<ulid>.json
//   agents/<name>/presence/<instance>.json
//   attachments/<sha256>              (reserved)
export const keys = {
  boardPrefix: (board: string) => `boards/${assertName(board, "board")}/`,
  postsPrefix: (board: string) => `boards/${assertName(board, "board")}/posts/`,
  dayPrefix: (board: string, day: string) => `boards/${assertName(board, "board")}/posts/${assertSegment(day, "day")}/`,
  post: (board: string, id: string, ms: number) => `boards/${assertName(board, "board")}/posts/${dayBucket(ms)}/${assertSegment(id, "id")}.json`,
  eventsPrefix: (board: string) => `boards/${assertName(board, "board")}/events/`,
  event: (board: string, id: string) => `boards/${assertName(board, "board")}/events/${assertSegment(id, "id")}.json`,
  presencePrefix: () => `agents/`,
  agentPresencePrefix: (name: string) => `agents/${assertName(name, "agent")}/presence/`,
  presence: (name: string, instance: string) => `agents/${assertName(name, "agent")}/presence/${assertSegment(instance, "instance")}.json`,
  attachment: (sha256: string) => `attachments/${assertSegment(sha256, "sha256")}`,
};
