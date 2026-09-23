// macOS's `/usr/bin/git` is an xcrun launcher that costs ~30 ms per spawn
// before git starts (docs/research/1093-git-lane-cost.md). Creates no
// repository, but only this lane carries the PATH override it guards.
import { execFile } from "node:child_process";
import { delimiter } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);

describe("git lane environment", () => {
  it("resolves git from its own exec-path before any launcher on PATH", async () => {
    const { stdout } = await run("git", ["--exec-path"]);

    expect(process.env.PATH?.split(delimiter)[0]).toBe(stdout.trim());
  });
});
