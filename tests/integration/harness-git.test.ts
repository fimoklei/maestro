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
    await git(root, "fetch", "--tags", "origin");
    await git(root, "remote", "set-head", "origin", "--auto");
  });

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
  });

  it("reads an annotated tag as the commit it points at, not the tag object", async () => {
    // A tag created outside Maestro may be annotated; comparing its own object
    // id against a commit would read a released harness as pending.
    await git(root, "tag", "-a", "v0.2.0", "-m", "release");
    await git(root, "push", "--tags", "origin");

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
});
