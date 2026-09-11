import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runWebviewerCli, WebviewerUsageError } from "../src/index.ts";
import { HOSTILE_BODY, hostilePost, snapshotFixture, type SnapshotFixture } from "./helpers.ts";

const fixtures: SnapshotFixture[] = [];
const scratch: string[] = [];
afterEach(async () => {
  for (const f of fixtures.splice(0)) await f.close();
  for (const dir of scratch.splice(0)) await rm(dir, { recursive: true, force: true });
});

describe("runWebviewerCli", () => {
  it("writes one self-contained inert HTML file from an export dir", async () => {
    const f = await snapshotFixture([{ board: "general", posts: [hostilePost({ title: "CLI run" })] }]);
    fixtures.push(f);
    const outDir = await mkdtemp(join(tmpdir(), "board-webviewer-out-"));
    scratch.push(outDir);
    const outPath = join(outDir, "viewer.html");
    const lines: string[] = [];

    const result = await runWebviewerCli(["--store", f.dir, "--out", outPath], { log: (line) => lines.push(line) });

    expect(result.outPath).toBe(outPath);
    expect(result.boards).toEqual(["general"]);
    expect(result.posts).toBe(1);
    const html = await readFile(outPath, "utf8");
    expect(html).toStartWith("<!doctype html>");
    expect(html).toContain("CLI run");
    // The hostile body survives only as escaped text (see helpers.ts).
    expect(html).toContain("onerror=&quot;");
    expect(html).not.toContain("<script");
    expect(lines.join("\n")).toContain(`wrote ${outPath}`);
    expect(lines.join("\n")).toContain("posts=1");
  });

  it("rejects bad usage without writing output", async () => {
    // G1 review LOW: --out must be exercised on real-store usage errors so
    // the "never wrote" assertion can actually fail; the writer stub counts.
    const f = await snapshotFixture([{ board: "general", posts: [hostilePost({ title: "usage" })] }]);
    fixtures.push(f);
    const outDir = await mkdtemp(join(tmpdir(), "board-webviewer-out-"));
    scratch.push(outDir);
    const outPath = join(outDir, "viewer.html");

    let writes = 0;
    const countingWriteOut = async (): Promise<void> => {
      writes += 1;
    };

    for (const argv of [
      ["--out", outPath],                                        // missing --store
      ["--store"],                                               // dangling flag value
      ["--store", f.dir, "extra"],                               // positionals are not accepted
      ["--store", f.dir, "--bogus"],                             // unknown flag
      ["--store", f.dir, "--out", outPath, "--board", "NOT-A-VALID-NAME"],
    ]) {
      await expect(runWebviewerCli(argv, { writeOut: countingWriteOut })).rejects.toThrow(WebviewerUsageError);
    }
    expect(writes).toBe(0); // the writer was never called
    await expect(stat(outPath)).rejects.toThrow(); // nothing was written
  });

  it("filters by board and renders the --title as escaped text", async () => {
    const f = await snapshotFixture([
      { board: "alpha", posts: [hostilePost({ title: "alpha post", body: "alpha body" })] },
      { board: "beta", posts: [{ title: "beta post", body: "beta body" }] },
    ]);
    fixtures.push(f);
    const outDir = await mkdtemp(join(tmpdir(), "board-webviewer-out-"));
    scratch.push(outDir);
    const outPath = join(outDir, "beta.html");

    const result = await runWebviewerCli(
      ["--store", f.dir, "--out", outPath, "--board", "beta", "--title", "<b>beta & friends</b>"],
      { log: () => undefined },
    );

    expect(result.boards).toEqual(["beta"]);
    expect(result.posts).toBe(1);
    const html = await readFile(outPath, "utf8");
    expect(html).toContain("beta body");
    expect(html).not.toContain("alpha body");
    expect(html).not.toContain("<b>beta & friends</b>");
    expect(html).toContain("&lt;b&gt;beta &amp; friends&lt;/b&gt;");
    expect(html).toContain(`<title>&lt;b&gt;beta &amp; friends&lt;/b&gt;</title>`);
  });

  it("prints usage text for --help", async () => {
    await expect(runWebviewerCli(["--help"])).rejects.toThrow("usage:");
  });
});
