// The scaffold's own push, against a repository that carries no tracking
// config at all — the shape #668 leaves a founder in, whatever put them there.
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { GitHarnessScaffoldAdapter } from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { removeGitTempTree } from "../helpers/git-fixture";

const run = promisify(execFile);

describe("GitHarnessScaffoldAdapter push", () => {
  let base: string;
  let remote: string;
  let root: string;

  const git = (cwd: string, ...args: string[]) => run("git", args, { cwd });
  const read = async (cwd: string, ...args: string[]) =>
    (await git(cwd, ...args)).stdout.trim();

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "maestro-scaffold-push-"));
    remote = join(base, "remote.git");
    root = join(base, "clone");
    await run("git", ["init", "--bare", "-b", "main", remote]);
    // `git init` + `remote add`, not `git clone`: no branch tracking config
    // exists on this repository at all, unlike a normal clone.
    await run("git", ["init", "-b", "main", root]);
    await git(root, "remote", "add", "origin", remote);
    await git(root, "config", "user.email", "test@example.com");
    await git(root, "config", "user.name", "Test");
    await writeFile(join(root, "apm.yml"), "name: team-harness\n", "utf8");
    await git(root, "add", "apm.yml");
    await git(root, "commit", "-m", "Scaffold the Harness");
  }, 30_000);

  afterEach(async () => {
    await removeGitTempTree(base);
  });

  it("sets upstream tracking on the branch it pushes", async () => {
    const outcome = await new GitHarnessScaffoldAdapter().push(root, "main");

    expect(outcome).toBe("pushed");
    expect(
      await read(root, "rev-parse", "--abbrev-ref", "main@{upstream}"),
    ).toBe("origin/main");
  });
});
