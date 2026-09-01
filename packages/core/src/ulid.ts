// ULID: 48-bit ms timestamp + 80-bit randomness, Crockford base32, 26 chars.
// Monotonic within a process: same-ms ids increment the random part.

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_LEN = 10;
const RAND_LEN = 16;

let lastTime = -1;
let lastRand: number[] = [];

function encodeTime(ms: number): string {
  let out = "";
  for (let i = TIME_LEN - 1; i >= 0; i--) {
    out = ALPHABET[ms % 32] + out;
    ms = Math.floor(ms / 32);
  }
  return out;
}

function randomDigits(): number[] {
  const bytes = new Uint8Array(RAND_LEN);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b % 32);
}

/** Mint a new ULID. Ids minted in the same ms by one process are strictly increasing. */
export function ulid(now: number = Date.now()): string {
  let rand: number[];
  if (now === lastTime) {
    rand = lastRand.slice();
    let i = RAND_LEN - 1;
    while (i >= 0) {
      if (rand[i]! < 31) { rand[i]!++; break; }
      rand[i] = 0; i--;
    }
    if (i < 0) throw new Error("ulid: random component overflow");
  } else {
    rand = randomDigits();
  }
  lastTime = now;
  lastRand = rand;
  return encodeTime(now) + rand.map((d) => ALPHABET[d]).join("");
}

export function isUlid(s: unknown): s is string {
  return typeof s === "string" && /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(s);
}

/** Milliseconds since epoch encoded in a ULID. */
export function ulidTime(id: string): number {
  if (!isUlid(id)) throw new Error(`not a ulid: ${id}`);
  let ms = 0;
  for (let i = 0; i < TIME_LEN; i++) ms = ms * 32 + ALPHABET.indexOf(id[i]!);
  return ms;
}
