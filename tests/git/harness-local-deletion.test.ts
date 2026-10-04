// The remote is a bare repo on disk, so the whole suite is offline.
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  DeleteLocalSkill,
  type HarnessFreshness,
  HarnessGitAdapter,
  InFlightLocks,
  NodeFileSystem,
  PromoteSkillDeletion,
  releasedSkillsFromGit,
} from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { removeGitTempTree } from "../helpers/git-fixture";
import { unavailableHarnessReview } from "../helpers/unreachable-harness";

const run = promisify(execFile);

const AT = new Date("2026-10-04T12:00:00.000Z");

const ORIGIN_URL = "git@github.com:fimoklei/agent-harness.git";

describe("deleting a Harness skill from the clone", () => {
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

  // Confirms against the folder as it is now, as the dialog's check does.
  const confirm = async (name: string) => {
    const check = await deleter().inspect();
    const skill = check.ok ? check.skills[name] : undefined;
    return deleter().execute(
      name,
      skill?.inClone === true ? skill.workingTree : "",
    );
  };

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
    // git rewrites the GitHub origin to the bare repo next door, so the suite
    // stays offline.
    await git(root, "config", `url.${remote}.insteadOf`, ORIGIN_URL);
    await git(root, "remote", "set-url", "origin", ORIGIN_URL);
    await writeSkill("jobs", "published");
    await writeFile(join(root, "README.md"), "harness\n", "utf8");
    await git(root, "add", ".");
    await git(root, "commit", "-m", "one skill");
    await git(root, "push", "origin", "HEAD:main");
    await new HarnessGitAdapter().fetch(root);
    await writeSkill("scratch", "never proposed");
  }, 30_000);

  afterEach(async () => {
    await removeGitTempTree(base);
  });

  it("removes the folder and leaves every other skill alone", async () => {
    await expect(confirm("scratch")).resolves.toEqual({
      ok: true,
      name: "scratch",
    });

    expect(await skills()).toEqual(["jobs"]);
  });

  it("leaves every ref in the clone and the remote exactly as it was", async () => {
    const before = await refs();

    await confirm("scratch");

    expect(await refs()).toEqual(before);
  });

  it("leaves HEAD, the real index and the rest of the working tree untouched", async () => {
    await writeFile(join(root, "staged.md"), "staged\n", "utf8");
    await git(root, "add", "staged.md");
    const head = (await git(root, "rev-parse", "HEAD")).stdout.trim();

    await confirm("scratch");

    expect((await git(root, "rev-parse", "HEAD")).stdout.trim()).toBe(head);
    expect((await git(root, "status", "--porcelain")).stdout).toBe(
      "A  staged.md\n",
    );
  });

  // Step 1 removes the folder; step 2, the existing deletion route, pushes it.
  it("takes a released skill from step 1 through step 2 to its proposal branch", async () => {
    const before = (await git(remote, "rev-parse", "main")).stdout.trim();

    await expect(confirm("jobs")).resolves.toEqual({ ok: true, name: "jobs" });
    expect(await skills()).toEqual(["scratch"]);
    expect((await git(remote, "rev-parse", "main")).stdout.trim()).toBe(before);

    const trees = await new HarnessGitAdapter().readMovementTrees(root);
    let freshness: HarnessFreshness = { outcome: null, lastFetchedAt: null };
    const step2 = new PromoteSkillDeletion({
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
    await expect(
      step2.execute("jobs", trees?.remote.jobs as string, AT),
    ).resolves.toMatchObject({ ok: true, branch: "maestro/jobs" });

    const pushed = await git(
      remote,
      "ls-tree",
      "-r",
      "--name-only",
      "refs/heads/maestro/jobs",
    );
    expect(pushed.stdout.trim().split("\n")).toEqual(["README.md"]);
  });

  // Inventory lists the release, not the clone: step 1 changes no release.
  it("keeps a released skill in Inventory after step 1", async () => {
    await git(root, "tag", "v1.0.0");
    await git(root, "push", "origin", "v1.0.0");
    await new HarnessGitAdapter().fetch(root);

    await expect(confirm("jobs")).resolves.toEqual({ ok: true, name: "jobs" });

    const released = await releasedSkillsFromGit(new HarnessGitAdapter())(root);
    expect(released?.map((skill) => skill.name)).toEqual(["jobs"]);
  });

  // Whichever guard catches it, nothing outside the Harness is removed.
  it("removes nothing through a link that points out of the Harness", async () => {
    const outside = join(base, "outside");
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, "SKILL.md"), "---\n---\n", "utf8");
    await symlink(outside, join(root, ".apm", "skills", "linked"));

    await expect(confirm("linked")).resolves.toMatchObject({
      ok: false,
    });

    expect(await new NodeFileSystem().exists(join(outside, "SKILL.md"))).toBe(
      true,
    );
  });

  it("refuses a skill that is not there at all", async () => {
    await expect(confirm("absent")).resolves.toEqual({
      ok: false,
      error: "already-gone",
    });
  });
});
