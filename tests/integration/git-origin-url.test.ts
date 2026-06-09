// The git side of the deploy chain: reading a clone's origin remote with real
// git, the source apm package references derive owner/repo from.
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { readGitOriginUrl } from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const run = promisify(execFile);

describe("readGitOriginUrl", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "maestro-git-origin-"));
    await run("git", ["init"], { cwd: dir });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns the origin remote url of a real clone", async () => {
    await run(
      "git",
      ["remote", "add", "origin", "git@github.com:fimoklei/agent-harness.git"],
      { cwd: dir },
    );
    expect(await readGitOriginUrl(dir)).toBe(
      "git@github.com:fimoklei/agent-harness.git",
    );
  });

  it("returns null when the repo has no origin remote", async () => {
    expect(await readGitOriginUrl(dir)).toBeNull();
  });

  it("returns null for a directory that is not a git repo", async () => {
    const plain = await mkdtemp(join(tmpdir(), "maestro-not-a-repo-"));
    try {
      expect(await readGitOriginUrl(plain)).toBeNull();
    } finally {
      await rm(plain, { recursive: true, force: true });
    }
  });
});
