// The remote is a bare repo on disk, so the whole suite is offline.
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  type HarnessFreshness,
  HarnessGitAdapter,
  InFlightLocks,
  PromoteSkillDeletion,
} from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { removeGitTempTree } from "../helpers/git-fixture";
import { unavailableHarnessReview } from "../helpers/unreachable-harness";

const run = promisify(execFile);

const AT = new Date("2026-08-18T12:00:00.000Z");

const ORIGIN_URL = "git@github.com:fimoklei/agent-harness.git";

describe("promoting a skill deletion", { timeout: 30_000 }, () => {
  let base: string;
  let remote: string;
  let root: string;
  let freshness: HarnessFreshness;

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
    new PromoteSkillDeletion({
      resolveRoot: async () => root,
      git: new HarnessGitAdapter(),
      freshness: {
        read: async () => freshness,
        record: async (_root, next) => {
          freshness = next;
        },
      },
      locks: new InFlightLocks(),
      review: unavailableHarnessReview(),
    });

  const seenTree = async (skill: string) =>
    (await new HarnessGitAdapter().readMovementTrees(root))?.remote[
      skill
    ] as string;

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "maestro-harness-deletion-"));
    remote = join(base, "remote.git");
    root = join(base, "clone");
    freshness = { outcome: null, lastFetchedAt: null };
    await run("git", ["init", "--bare", "-b", "main", remote]);
    await git(remote, "config", "user.email", "remote@example.com");
    await git(remote, "config", "user.name", "Remote");
    await run("git", ["clone", remote, root]);
    await git(root, "config", "user.email", "test@example.com");
    await git(root, "config", "user.name", "Test");
    // git rewrites the GitHub origin to the bare repo next door, so the suite
    // stays offline.
    await git(root, "config", `url.${remote}.insteadOf`, ORIGIN_URL);
    await git(root, "remote", "set-url", "origin", ORIGIN_URL);
    await writeSkill("tdd", "as published");
    await writeSkill("jobs", "kept");
    await writeFile(join(root, "README.md"), "harness\n", "utf8");
    await git(root, "add", ".");
    await git(root, "commit", "-m", "two skills");
    await git(root, "push", "origin", "HEAD:main");
    await new HarnessGitAdapter().fetch(root);
  }, 30_000);

  afterEach(async () => {
    await removeGitTempTree(base);
  });

  const promoted = async (skill: string, ...args: string[]) =>
    (await git(remote, ...args, `refs/heads/maestro/${skill}`)).stdout.trim();

  const deleteOnDisk = async (skill: string) =>
    rm(join(root, ".apm", "skills", skill), { recursive: true, force: true });

  it("removes exactly that skill's subtree from the fetched tip, and nothing else", async () => {
    const seen = await seenTree("tdd");
    await deleteOnDisk("tdd");

    await expect(deleter().execute("tdd", seen, AT)).resolves.toEqual({
      ok: true,
      branch: "maestro/tdd",
      pullRequestUrl: expect.stringContaining("/compare/main...maestro/tdd"),
    });

    const files = await promoted("tdd", "ls-tree", "-r", "--name-only");
    expect(files.split("\n").sort()).toEqual([
      ".apm/skills/jobs/SKILL.md",
      "README.md",
    ]);
  });

  it("moves the skill into Pending review, so a refresh reads it back", async () => {
    const seen = await seenTree("tdd");
    await deleteOnDisk("tdd");

    await deleter().execute("tdd", seen, AT);
    await new HarnessGitAdapter().fetch(root);

    const trees = await new HarnessGitAdapter().readMovementTrees(root);
    // A branch with no tree for this skill proposes its deletion, which is not
    // the same fact as having no branch at all.
    expect(Object.hasOwn(trees?.promote ?? {}, "tdd")).toBe(true);
    expect(trees?.promote.tdd?.tree ?? null).toBeNull();
    expect(trees?.remote.tdd).toBe(seen);
  });

  it("leaves HEAD, the real index, and the working tree exactly as they were", async () => {
    const seen = await seenTree("tdd");
    await writeFile(join(root, "staged.md"), "staged\n", "utf8");
    await git(root, "add", "staged.md");
    await deleteOnDisk("tdd");
    const head = (await git(root, "rev-parse", "HEAD")).stdout.trim();
    const status = (await git(root, "status", "--porcelain")).stdout;
    const branches = (await git(root, "branch", "--list")).stdout;

    await deleter().execute("tdd", seen, AT);

    expect((await git(root, "rev-parse", "HEAD")).stdout.trim()).toBe(head);
    expect((await git(root, "status", "--porcelain")).stdout).toBe(status);
    expect((await git(root, "branch", "--list")).stdout).toBe(branches);
  });

  it("refuses a confirmation a teammate's merged change has moved past", async () => {
    const seen = await seenTree("tdd");

    const other = join(base, "other");
    await run("git", ["clone", remote, other]);
    await git(other, "config", "user.email", "mate@example.com");
    await git(other, "config", "user.name", "Mate");
    await writeFile(
      join(other, ".apm", "skills", "tdd", "SKILL.md"),
      "---\ndescription: their edit\n---\n",
      "utf8",
    );
    await git(other, "commit", "-am", "their edit");
    await git(other, "push", "origin", "HEAD:main");
    await deleteOnDisk("tdd");

    await expect(deleter().execute("tdd", seen, AT)).resolves.toEqual({
      ok: false,
      error: "confirmation-stale",
    });

    await expect(
      git(remote, "rev-parse", "--verify", "refs/heads/maestro/tdd"),
    ).rejects.toThrow();
  });

  it("refuses a skill that is still on disk, which is an edit and not a removal", async () => {
    const seen = await seenTree("tdd");

    await expect(deleter().execute("tdd", seen, AT)).resolves.toEqual({
      ok: false,
      error: "not-deleted",
    });

    await expect(
      git(remote, "rev-parse", "--verify", "refs/heads/maestro/tdd"),
    ).rejects.toThrow();
  });

  it("refuses a name local HEAD never tracked, so an untracked name is no deletion", async () => {
    const seen = await seenTree("tdd");

    await expect(deleter().execute("absent", seen, AT)).resolves.toEqual({
      ok: false,
      error: "not-deleted",
    });
  });

  describe("an ambiguous working tree", () => {
    const refuses = async (error: string) => {
      const seen = await seenTree("tdd");
      await deleteOnDisk("tdd");

      await expect(deleter().execute("tdd", seen, AT)).resolves.toEqual({
        ok: false,
        error,
      });

      await expect(
        git(remote, "rev-parse", "--verify", "refs/heads/maestro/tdd"),
      ).rejects.toThrow();
    };

    it("refuses while the checkout is sparse", async () => {
      await git(root, "sparse-checkout", "init");
      await refuses("sparse-checkout");
    });

    it("refuses while a merge is in progress", async () => {
      await conflictingBranch();
      await git(root, "merge", "theirs").catch(() => {});
      await refuses("merge-in-progress");
    });

    it("refuses while a rebase is in progress", async () => {
      await conflictingBranch();
      await git(root, "rebase", "theirs").catch(() => {});
      await refuses("rebase-in-progress");
    });

    it("refuses while a conflict is left unresolved", async () => {
      await conflictingBranch();
      await git(root, "merge", "theirs").catch(() => {});
      // `--quit` drops MERGE_HEAD and leaves the conflicted entries standing.
      await git(root, "merge", "--quit");
      await refuses("unresolved-conflicts");
    });

    // The conflict is outside the skills tree.
    const conflictingBranch = async () => {
      await git(root, "checkout", "-b", "theirs");
      await writeFile(join(root, "README.md"), "theirs\n", "utf8");
      await git(root, "commit", "-am", "theirs");
      await git(root, "checkout", "main");
      await writeFile(join(root, "README.md"), "mine\n", "utf8");
      await git(root, "commit", "-am", "mine");
    };
  });
});
