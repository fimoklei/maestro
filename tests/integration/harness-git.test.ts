// The Harness home base's git reads, against a real clone and a real remote.
// The remote is a bare repo on disk, so the whole suite is offline: no network
// lane, no credentials (.claude/rules/testing.md).
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { HarnessGitAdapter } from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const run = promisify(execFile);

describe("HarnessGitAdapter", { timeout: 30_000 }, () => {
  let base: string;
  let remote: string;
  let root: string;

  const git = (cwd: string, ...args: string[]) => run("git", args, { cwd });

  const commit = async (message: string) => {
    await mkdir(join(root, ".apm", "skills", "tdd"), { recursive: true });
    await writeFile(
      join(root, ".apm", "skills", "tdd", "SKILL.md"),
      `---\ndescription: ${message}\n---\n`,
      "utf8",
    );
    await git(root, "add", ".");
    await git(root, "commit", "-m", message);
  };

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "maestro-harness-git-"));
    remote = join(base, "remote.git");
    root = join(base, "clone");
    await run("git", ["init", "--bare", "-b", "main", remote]);
    await run("git", ["clone", remote, root]);
    await git(root, "config", "user.email", "test@example.com");
    await git(root, "config", "user.name", "Test");
    await commit("first skill");
    await git(root, "tag", "v0.1.0");
    await git(root, "push", "--tags", "origin", "HEAD:main");
    // Seeded through the adapter, so the clone carries exactly the refs the
    // product's own fetch writes.
    await new HarnessGitAdapter().fetch(root);
  }, 30_000);

  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  const adapter = () => new HarnessGitAdapter();

  it("reads the origin, default branch, and release tags of the clone", async () => {
    const facts = await adapter().readFacts(root);

    const head = (await git(root, "rev-parse", "HEAD")).stdout.trim();
    expect(facts.originUrl).toBe(remote);
    expect(facts.defaultBranch).toBe("main");
    expect(facts.defaultBranchCommit).toBe(head);
    expect(facts.tags).toEqual([{ name: "v0.1.0", commit: head }]);
    // Named here, not just implied by the read: the fetch and the read agree
    // on one namespace, and it is not the author's own `refs/tags`.
    expect(
      (await git(root, "rev-parse", "refs/maestro/tags/v0.1.0")).stdout.trim(),
    ).toBe(head);
  });

  it("reads an annotated tag as the commit it points at, not the tag object", async () => {
    // A tag created outside Maestro may be annotated; comparing its own object
    // id against a commit would read a released harness as pending.
    await git(root, "tag", "-a", "v0.2.0", "-m", "release");
    await git(root, "push", "--tags", "origin");
    await adapter().fetch(root);

    const facts = await adapter().readFacts(root);

    const head = (await git(root, "rev-parse", "HEAD")).stdout.trim();
    expect(facts.tags).toContainEqual({ name: "v0.2.0", commit: head });
  });

  it("brings a teammate's merged work and tags into view", async () => {
    const other = join(base, "other");
    await run("git", ["clone", remote, other]);
    await git(other, "config", "user.email", "mate@example.com");
    await git(other, "config", "user.name", "Mate");
    await writeFile(join(other, "notes.md"), "team change\n", "utf8");
    await git(other, "add", ".");
    await git(other, "commit", "-m", "team change");
    await git(other, "tag", "v0.2.0");
    await git(other, "push", "--tags", "origin", "HEAD:main");

    await expect(adapter().fetch(root)).resolves.toBe("fetched");

    const facts = await adapter().readFacts(root);
    expect(facts.tags.map((tag) => tag.name)).toContain("v0.2.0");
    const remoteHead = (await git(other, "rev-parse", "HEAD")).stdout.trim();
    expect(facts.defaultBranchCommit).toBe(remoteHead);
  });

  it("never presents an unpushed local tag as the released version", async () => {
    await commit("work in progress");
    await git(root, "tag", "v9.9.9");

    await adapter().fetch(root);

    const facts = await adapter().readFacts(root);
    expect(facts.tags.map((tag) => tag.name)).not.toContain("v9.9.9");
  });

  it("drops a tag the remote no longer has, and keeps the author's own", async () => {
    await git(root, "tag", "mine");
    await git(remote, "tag", "-d", "v0.1.0");

    await adapter().fetch(root);

    const facts = await adapter().readFacts(root);
    expect(facts.tags.map((tag) => tag.name)).not.toContain("v0.1.0");
    // Pruning must reach only Maestro's own namespace: deleting the author's
    // local tags would be a change to their repository.
    expect((await git(root, "tag", "--list")).stdout).toContain("mine");
  });

  it("follows the remote when its default branch is renamed", async () => {
    await git(remote, "branch", "trunk", "main");
    await git(remote, "symbolic-ref", "HEAD", "refs/heads/trunk");

    await adapter().fetch(root);

    await expect(adapter().readFacts(root)).resolves.toMatchObject({
      defaultBranch: "trunk",
    });
  });

  it("leaves the author's checkout where it was", async () => {
    // A fetch must never move HEAD, the index, or the working tree — the
    // author's editor cannot shift underneath them (ADR-0021).
    await commit("local work");
    await writeFile(join(root, "staged.md"), "staged\n", "utf8");
    await git(root, "add", "staged.md");
    const before = (await git(root, "rev-parse", "HEAD")).stdout.trim();

    await adapter().fetch(root);

    expect((await git(root, "rev-parse", "HEAD")).stdout.trim()).toBe(before);
    expect((await git(root, "status", "--porcelain")).stdout).toContain(
      "A  staged.md",
    );
  });

  it("reports a remote that is not there as a failed fetch, and does not throw", async () => {
    await git(root, "remote", "set-url", "origin", join(base, "gone.git"));

    await expect(adapter().fetch(root)).resolves.toBe("fetch-failed");
  });

  it("reads a clone with no origin as an unavailable origin, not a crash", async () => {
    await git(root, "remote", "remove", "origin");

    await expect(adapter().readFacts(root)).resolves.toMatchObject({
      originUrl: null,
    });
  });

  describe("skill trees", () => {
    const writeSkill = async (name: string, body: string) => {
      await mkdir(join(root, ".apm", "skills", name), { recursive: true });
      await writeFile(
        join(root, ".apm", "skills", name, "SKILL.md"),
        `---\ndescription: ${body}\n---\n`,
        "utf8",
      );
    };

    it("reads one tree hash per skill directory at every ref", async () => {
      const trees = await adapter().readSkillTrees(root);

      const hash = (
        await git(root, "rev-parse", "HEAD:.apm/skills/tdd")
      ).stdout.trim();
      expect(trees.remote).toEqual({ tdd: hash });
      expect(trees.local).toEqual({ tdd: hash });
      expect(trees.working).toEqual({ tdd: hash });
      expect(trees.promote).toEqual({});
    });

    it("includes a skill that exists only as untracked files on disk", async () => {
      await writeSkill("draft", "never committed");

      const trees = await adapter().readSkillTrees(root);

      expect(Object.keys(trees.working).sort()).toEqual(["draft", "tdd"]);
      expect(trees.local).not.toHaveProperty("draft");
    });

    it("reads an edited skill as different content without committing it", async () => {
      await writeSkill("tdd", "edited on disk");

      const trees = await adapter().readSkillTrees(root);

      expect(trees.working.tdd).not.toBe(trees.local.tdd);
    });

    it("leaves the author's real index and working tree untouched", async () => {
      // The temporary index is the whole point: an author's staged work must
      // survive a read of the Harness view (ADR-0021).
      await writeFile(join(root, "staged.md"), "staged\n", "utf8");
      await git(root, "add", "staged.md");
      await writeSkill("draft", "never committed");
      const before = (await git(root, "status", "--porcelain")).stdout;

      await adapter().readSkillTrees(root);

      expect((await git(root, "status", "--porcelain")).stdout).toBe(before);
    });

    it("reads a skill's content on its promote branch", async () => {
      await writeSkill("tdd", "up for review");
      await git(root, "add", ".");
      await git(root, "commit", "-m", "propose");
      await git(root, "push", "origin", "HEAD:refs/heads/maestro/tdd");
      await git(root, "reset", "--hard", "HEAD~1");
      await adapter().fetch(root);

      const trees = await adapter().readSkillTrees(root);

      expect(Object.keys(trees.promote)).toEqual(["tdd"]);
      expect(trees.promote.tdd).not.toBe(trees.remote.tdd);
    });

    it("reads a harness with no skills directory as no skills at all", async () => {
      await rm(join(root, ".apm"), { recursive: true, force: true });
      await git(root, "add", ".");
      await git(root, "commit", "-m", "drop skills");
      await git(root, "push", "origin", "HEAD:main");
      await adapter().fetch(root);

      await expect(adapter().readSkillTrees(root)).resolves.toEqual({
        remote: {},
        promote: {},
        local: {},
        working: {},
      });
    });
  });
});
