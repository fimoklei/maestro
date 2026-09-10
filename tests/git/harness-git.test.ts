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
import { removeGitTempTree } from "../helpers/git-fixture";

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
    await removeGitTempTree(base);
  });

  const adapter = () => new HarnessGitAdapter();

  // Null is a namespace the adapter could not read at all. Asserting that
  // apart from the names keeps a read failure from passing as "no releases".
  const tagNames = (tags: { name: string }[] | null): string[] => {
    expect(tags).not.toBeNull();
    return (tags ?? []).map((tag) => tag.name);
  };

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
    expect(tagNames(facts.tags)).toContain("v0.2.0");
    const remoteHead = (await git(other, "rev-parse", "HEAD")).stdout.trim();
    expect(facts.defaultBranchCommit).toBe(remoteHead);
  });

  it("never presents an unpushed local tag as the released version", async () => {
    await commit("work in progress");
    await git(root, "tag", "v9.9.9");

    await adapter().fetch(root);

    const facts = await adapter().readFacts(root);
    expect(tagNames(facts.tags)).not.toContain("v9.9.9");
  });

  it("drops a tag the remote no longer has, and keeps the author's own", async () => {
    await git(root, "tag", "mine");
    await git(remote, "tag", "-d", "v0.1.0");

    await adapter().fetch(root);

    const facts = await adapter().readFacts(root);
    // Emptied, not unreadable: a namespace with nothing in it is an answer,
    // and only a failed read is null (#519).
    expect(facts.tags).toEqual([]);
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
    // Null is a ref nobody could read, which every test here but its own case
    // treats as the failure it is rather than working around it.
    const movementTrees = async (path: string) => {
      const trees = await adapter().readMovementTrees(path);
      if (trees === null) {
        throw new Error("every ref should have been readable");
      }
      return trees;
    };

    const writeSkill = async (name: string, body: string) => {
      await mkdir(join(root, ".apm", "skills", name), { recursive: true });
      await writeFile(
        join(root, ".apm", "skills", name, "SKILL.md"),
        `---\ndescription: ${body}\n---\n`,
        "utf8",
      );
    };

    it("reads one tree hash per skill directory at every ref", async () => {
      const trees = await movementTrees(root);

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

      const trees = await movementTrees(root);

      expect(Object.keys(trees.working).sort()).toEqual(["draft", "tdd"]);
      expect(trees.local).not.toHaveProperty("draft");
    });

    it("reads an edited skill as different content without committing it", async () => {
      await writeSkill("tdd", "edited on disk");

      const trees = await movementTrees(root);

      expect(trees.working.tdd).not.toBe(trees.local.tdd);
    });

    it("leaves the author's real index and working tree untouched", async () => {
      // The temporary index is the whole point: an author's staged work must
      // survive a read of the Harness view (ADR-0021).
      await writeFile(join(root, "staged.md"), "staged\n", "utf8");
      await git(root, "add", "staged.md");
      await writeSkill("draft", "never committed");
      const before = (await git(root, "status", "--porcelain")).stdout;

      await movementTrees(root);

      expect((await git(root, "status", "--porcelain")).stdout).toBe(before);
    });

    it("reads a skill's content on its promote branch", async () => {
      await writeSkill("tdd", "up for review");
      await git(root, "add", ".");
      await git(root, "commit", "-m", "propose");
      await git(root, "push", "origin", "HEAD:refs/heads/maestro/tdd");
      await git(root, "reset", "--hard", "HEAD~1");
      await adapter().fetch(root);

      const trees = await movementTrees(root);

      expect(Object.keys(trees.promote)).toEqual(["tdd"]);
      expect(trees.promote.tdd?.tree).not.toBe(trees.remote.tdd);
    });

    it("reads a promote branch's tip commit beside its tree", async () => {
      await writeSkill("tdd", "up for review");
      await git(root, "add", ".");
      await git(root, "commit", "-m", "propose");
      await git(root, "push", "origin", "HEAD:refs/heads/maestro/tdd");
      const tip = (await git(root, "rev-parse", "HEAD")).stdout.trim();
      const tree = (
        await git(root, "rev-parse", "HEAD:.apm/skills/tdd")
      ).stdout.trim();
      await git(root, "reset", "--hard", "HEAD~1");
      await writeSkill("unproposed", "nobody proposed this one");
      await adapter().fetch(root);

      const trees = await movementTrees(root);

      expect(trees.promote.tdd).toEqual({ tree, commit: tip });
      // No promote branch is no ref to read: neither answer can be given.
      expect(trees.promote.unproposed?.tree ?? null).toBeNull();
      expect(trees.promote.unproposed?.commit ?? null).toBeNull();
    });

    it("names a promote branch that proposes deleting its skill", async () => {
      // The branch carries no tree to hash, and dropping it would hide a
      // deletion that is waiting for review.
      await git(root, "checkout", "-q", "-b", "maestro/tdd");
      await rm(join(root, ".apm", "skills", "tdd"), { recursive: true });
      await git(root, "add", "-A");
      await git(root, "commit", "-q", "-m", "propose removing tdd");
      await git(root, "push", "-q", "origin", "HEAD:refs/heads/maestro/tdd");
      await git(root, "checkout", "-q", "-");
      await adapter().fetch(root);

      const trees = await movementTrees(root);

      expect(Object.hasOwn(trees.promote, "tdd")).toBe(true);
      expect(trees.promote.tdd).toEqual({
        tree: null,
        commit: (
          await git(root, "rev-parse", "refs/remotes/origin/maestro/tdd")
        ).stdout.trim(),
      });
    });

    it("hashes a tracked skill file the same even when a rule ignores it", async () => {
      // git exempts an already-tracked file from the ignore rules. An index
      // built from nothing knows of no tracked files, so the file would drop
      // out and an untouched skill would read as edited.
      await writeFile(join(root, ".gitignore"), "*.log\n", "utf8");
      await writeFile(
        join(root, ".apm", "skills", "tdd", "notes.log"),
        "kept\n",
        "utf8",
      );
      await git(root, "add", "-A", "-f");
      await git(root, "commit", "-q", "-m", "track an ignored file");

      const trees = await movementTrees(root);

      expect(trees.working.tdd).toBe(trees.local.tdd);
    });

    it("refuses to read a failed git call as a harness with nothing on disk", async () => {
      // Reporting every skill as gone would be a confident wrong answer, and
      // the author would see their whole harness as deleted locally.
      const notARepo = join(base, "loose");
      await mkdir(join(notARepo, ".apm", "skills", "tdd"), { recursive: true });
      await writeFile(
        join(notARepo, ".apm", "skills", "tdd", "SKILL.md"),
        "---\n---\n",
        "utf8",
      );

      await expect(adapter().readMovementTrees(notARepo)).rejects.toThrow();
    });

    it("reads a harness with no skills directory as no skills at all", async () => {
      await rm(join(root, ".apm"), { recursive: true, force: true });
      await git(root, "add", ".");
      await git(root, "commit", "-m", "drop skills");
      await git(root, "push", "origin", "HEAD:main");
      await adapter().fetch(root);

      await expect(adapter().readMovementTrees(root)).resolves.toEqual({
        remote: {},
        promote: {},
        local: {},
        working: {},
      });
    });
  });

  describe("publishTag", () => {
    it("creates and pushes a lightweight tag at the exact commit, without a local tag object", async () => {
      const head = (await git(root, "rev-parse", "HEAD")).stdout.trim();

      await expect(
        adapter().publishTag(root, "v0.2.0", head, "main"),
      ).resolves.toBe("pushed");

      const remoteTag = (
        await git(remote, "rev-parse", "refs/tags/v0.2.0")
      ).stdout.trim();
      expect(remoteTag).toBe(head);
      expect((await git(root, "tag", "--list")).stdout).not.toContain("v0.2.0");
    });

    it("mirrors the pushed tag locally, so a read afterwards needs no second fetch", async () => {
      const head = (await git(root, "rev-parse", "HEAD")).stdout.trim();

      await adapter().publishTag(root, "v0.2.0", head, "main");

      const facts = await adapter().readFacts(root);
      expect(facts.tags).toContainEqual({ name: "v0.2.0", commit: head });
    });

    it("refuses to overwrite a name the remote already has at a different commit", async () => {
      const head = (await git(root, "rev-parse", "HEAD")).stdout.trim();
      await adapter().publishTag(root, "v0.2.0", head, "main");
      await commit("second skill");
      const nextHead = (await git(root, "rev-parse", "HEAD")).stdout.trim();

      await expect(
        adapter().publishTag(root, "v0.2.0", nextHead, "main"),
      ).resolves.toBe("already-exists");
      expect(
        (await git(remote, "rev-parse", "refs/tags/v0.2.0")).stdout.trim(),
      ).toBe(head);
    });

    it("refuses to tag a tip the remote branch has already moved past", async () => {
      // The window issue #520's one-read-then-push design leaves open: a
      // teammate pushes between the two. The lease turns that into a refusal,
      // and `--atomic` means no tag was created at the commit the branch left
      // behind (#520).
      const head = (await git(root, "rev-parse", "HEAD")).stdout.trim();
      const other = join(base, "other");
      await run("git", ["clone", remote, other]);
      await git(other, "config", "user.email", "other@example.com");
      await git(other, "config", "user.name", "Other");
      await writeFile(join(other, "theirs.md"), "theirs\n", "utf8");
      await git(other, "add", ".");
      await git(other, "commit", "-m", "their commit");
      await git(other, "push", "origin", "HEAD:main");

      await expect(
        adapter().publishTag(root, "v0.2.0", head, "main"),
      ).resolves.toBe("stale-tip");

      await expect(
        git(remote, "rev-parse", "refs/tags/v0.2.0"),
      ).rejects.toThrow();
    });

    // A push that errors out after the remote already wrote the tag — a
    // timeout on the way back, a receive-pack that fails at the end. Reported
    // as a failure it would strand the author: the retry reads the tag their
    // own attempt created and refuses the whole plan (#520).
    const failAfterAccepting = async () => {
      const script = join(base, "receive-pack.sh");
      await writeFile(script, '#!/bin/sh\ngit-receive-pack "$@"\nexit 1\n', {
        encoding: "utf8",
        mode: 0o755,
      });
      await git(root, "config", "remote.origin.receivepack", script);
    };

    it("reads a push that failed after the remote took the tag as pushed", async () => {
      const head = (await git(root, "rev-parse", "HEAD")).stdout.trim();
      await failAfterAccepting();

      await expect(
        adapter().publishTag(root, "v0.2.0", head, "main"),
      ).resolves.toBe("pushed");

      const facts = await adapter().readFacts(root);
      expect(facts.tags).toContainEqual({ name: "v0.2.0", commit: head });
    });

    it("leaves a push that never reached the remote as the failure it was", async () => {
      const head = (await git(root, "rev-parse", "HEAD")).stdout.trim();
      await git(root, "remote", "set-url", "origin", join(base, "gone.git"));

      await expect(
        adapter().publishTag(root, "v0.2.0", head, "main"),
      ).resolves.toBe("push-failed");
    });

    it("leaves the author's checkout where it was", async () => {
      const head = (await git(root, "rev-parse", "HEAD")).stdout.trim();
      await writeFile(join(root, "staged.md"), "staged\n", "utf8");
      await git(root, "add", "staged.md");

      await adapter().publishTag(root, "v0.2.0", head, "main");

      expect((await git(root, "rev-parse", "HEAD")).stdout.trim()).toBe(head);
      expect((await git(root, "status", "--porcelain")).stdout).toContain(
        "A  staged.md",
      );
    });

    it("reports a remote that is not there as a failed push, and does not throw", async () => {
      const head = (await git(root, "rev-parse", "HEAD")).stdout.trim();
      await git(root, "remote", "set-url", "origin", join(base, "gone.git"));

      await expect(
        adapter().publishTag(root, "v0.2.0", head, "main"),
      ).resolves.toBe("push-failed");
    });

    it("reports the tag as pushed even when the local mirror update fails", async () => {
      // The remote tag is the fact that matters; a local bookkeeping write
      // that loses a lock race must never turn an already-published release
      // into a reported failure (#520).
      const head = (await git(root, "rev-parse", "HEAD")).stdout.trim();
      const lockDir = join(root, ".git", "refs", "maestro", "tags");
      await mkdir(lockDir, { recursive: true });
      const lockFile = join(lockDir, "v0.2.0.lock");
      await writeFile(lockFile, "", "utf8");

      try {
        await expect(
          adapter().publishTag(root, "v0.2.0", head, "main"),
        ).resolves.toBe("pushed");
      } finally {
        await rm(lockFile, { force: true });
      }
      expect(
        (await git(remote, "rev-parse", "refs/tags/v0.2.0")).stdout.trim(),
      ).toBe(head);
    });
  });
});
