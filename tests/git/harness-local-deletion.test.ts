// Deleting a skill that exists nowhere else, against a real clone and a real
// remote. The remote is a bare repo on disk, so the whole suite is offline
// (.claude/rules/testing.md).
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  DeleteLocalSkill,
  HarnessGitAdapter,
  InFlightLocks,
  NodeFileSystem,
} from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { removeGitTempTree } from "../helpers/git-fixture";

const run = promisify(execFile);

const ORIGIN_URL = "git@github.com:fimoklei/agent-harness.git";

describe("deleting a Harness skill that exists nowhere else", () => {
  let base: string;
  let remote: string;
  let root: string;

  const git = (cwd: string, ...args: string[]) => run("git", args, { cwd });

  const writeSkill = async (name: string, body: string) => {
    await mkdir(join(root, ".apm", "skills", name), { recursive: true });
    await writeFile(
      join(root, ".apm", "skills", name, "SKILL.md"),
      `---\ndescription: ${body}\n---\n`,
      "utf8",
    );
  };

  const deleter = () =>
    new DeleteLocalSkill({
      resolveRoot: async () => root,
      fs: new NodeFileSystem(),
      git: new HarnessGitAdapter(),
      locks: new InFlightLocks(),
    });

  // Every ref both repositories hold, so nothing about a branch, a tag or a
  // remote-tracking ref can move without this test seeing it.
  const refs = async () => ({
    clone: (await git(root, "show-ref")).stdout,
    remote: (await git(remote, "show-ref")).stdout,
  });

  const skills = async () =>
    Object.keys(
      (await new HarnessGitAdapter().readMovementTrees(root))?.working ?? {},
    ).sort();

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "maestro-local-deletion-"));
    remote = join(base, "remote.git");
    root = join(base, "clone");
    await run("git", ["init", "--bare", "-b", "main", remote]);
    await git(remote, "config", "user.email", "remote@example.com");
    await git(remote, "config", "user.name", "Remote");
    await run("git", ["clone", remote, root]);
    await git(root, "config", "user.email", "test@example.com");
    await git(root, "config", "user.name", "Test");
    // A GitHub origin git rewrites to the bare repo next door, so the suite
    // stays offline (LEARNINGS · git-remote-get-url).
    await git(root, "config", `url.${remote}.insteadOf`, ORIGIN_URL);
    await git(root, "remote", "set-url", "origin", ORIGIN_URL);
    await writeSkill("jobs", "published");
    await writeFile(join(root, "README.md"), "harness\n", "utf8");
    await git(root, "add", ".");
    await git(root, "commit", "-m", "one skill");
    await git(root, "push", "origin", "HEAD:main");
    await new HarnessGitAdapter().fetch(root);
    // The skill under test: written after the push, so no ref anywhere holds it.
    await writeSkill("scratch", "never proposed");
  }, 30_000);

  afterEach(async () => {
    await removeGitTempTree(base);
  });

  it("removes the folder and leaves every other skill alone", async () => {
    await expect(deleter().execute("scratch")).resolves.toEqual({
      ok: true,
      name: "scratch",
    });

    expect(await skills()).toEqual(["jobs"]);
  });

  it("leaves every ref in the clone and the remote exactly as it was", async () => {
    const before = await refs();

    await deleter().execute("scratch");

    expect(await refs()).toEqual(before);
  });

  it("leaves HEAD, the real index and the rest of the working tree untouched", async () => {
    await writeFile(join(root, "staged.md"), "staged\n", "utf8");
    await git(root, "add", "staged.md");
    const head = (await git(root, "rev-parse", "HEAD")).stdout.trim();

    await deleter().execute("scratch");

    expect((await git(root, "rev-parse", "HEAD")).stdout.trim()).toBe(head);
    // The staged file is still staged, and the only working-tree change is the
    // folder that went.
    expect((await git(root, "status", "--porcelain")).stdout).toBe(
      "A  staged.md\n",
    );
  });

  it("refuses a skill the default branch already holds", async () => {
    await expect(deleter().execute("jobs")).resolves.toEqual({
      ok: false,
      error: "not-local-only",
    });

    expect(await skills()).toEqual(["jobs", "scratch"]);
  });

  // Which refusal it is depends on git: a symlink is a blob in the working
  // tree, not a skill directory. What matters is that nothing outside the
  // Harness is removed, whichever guard catches it first.
  it("removes nothing through a link that points out of the Harness", async () => {
    const outside = join(base, "outside");
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, "SKILL.md"), "---\n---\n", "utf8");
    await symlink(outside, join(root, ".apm", "skills", "linked"));

    await expect(deleter().execute("linked")).resolves.toMatchObject({
      ok: false,
    });

    expect(await new NodeFileSystem().exists(join(outside, "SKILL.md"))).toBe(
      true,
    );
  });

  it("refuses a skill that is not there at all", async () => {
    await expect(deleter().execute("absent")).resolves.toEqual({
      ok: false,
      error: "already-gone",
    });
  });
});
