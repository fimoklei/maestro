import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { probeHead } from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { removeGitTempTree } from "../helpers/git-fixture";

const run = promisify(execFile);

describe("probeHead", () => {
  let base: string;

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "maestro-head-probe-"));
  });

  afterEach(async () => {
    await removeGitTempTree(base);
  });

  it("reads a repository with a commit as one", async () => {
    const repo = join(base, "repo");
    await run("git", ["init", "-b", "main", repo]);
    await writeFile(join(repo, "a.txt"), "a\n", "utf8");
    await run("git", ["-C", repo, "add", "a.txt"]);
    await run("git", [
      "-C",
      repo,
      "-c",
      "user.email=test@example.com",
      "-c",
      "user.name=Test",
      "commit",
      "-m",
      "First",
    ]);

    expect(await probeHead(repo)).toBe("commit");
  });

  it("reads a repository without a commit as having no head", async () => {
    const repo = join(base, "empty");
    await run("git", ["init", "-b", "main", repo]);

    expect(await probeHead(repo)).toBe("no-head");
  });

  it("reads a folder git cannot inspect as unknown, never as empty", async () => {
    const plain = join(base, "plain");
    await mkdir(plain);

    expect(await probeHead(plain)).toBe("unknown");
  });
});
