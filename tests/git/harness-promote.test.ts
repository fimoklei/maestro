// The remote is a bare repo on disk, so the whole suite is offline.
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  type HarnessFreshness,
  HarnessGitAdapter,
  InFlightLocks,
  PromoteSkill,
} from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { removeGitTempTree } from "../helpers/git-fixture";
import { unavailableHarnessReview } from "../helpers/unreachable-harness";

const run = promisify(execFile);

const AT = new Date("2026-08-09T12:00:00.000Z");

const ORIGIN_URL = "git@github.com:fimoklei/agent-harness.git";

describe("promoting a skill", { timeout: 30_000 }, () => {
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

  const promoter = () =>
    new PromoteSkill({
      resolveRoot: async () => root,
      git: new HarnessGitAdapter(),
      freshness: {
        read: async () => freshness,
        record: async (_root, next) => {
          freshness = next;
        },
      },
      locks: new InFlightLocks(),
      // No GitHub capability in this lane: the push is what these journeys prove.
      review: unavailableHarnessReview(),
    });

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "maestro-harness-promote-"));
    remote = join(base, "remote.git");
    root = join(base, "clone");
    freshness = { outcome: null, lastFetchedAt: null };
    await run("git", ["init", "--bare", "-b", "main", remote]);
    // A bare repo on a CI runner has no identity to fall back on.
    await git(remote, "config", "user.email", "remote@example.com");
    await git(remote, "config", "user.name", "Remote");
    await run("git", ["clone", remote, root]);
    await git(root, "config", "user.email", "test@example.com");
    await git(root, "config", "user.name", "Test");
    // git rewrites the GitHub origin to the bare repo next door, so the suite
    // stays offline while the pull-request URL is still built from it.
    await git(root, "config", `url.${remote}.insteadOf`, ORIGIN_URL);
    await git(root, "remote", "set-url", "origin", ORIGIN_URL);
    await writeSkill("tdd", "as published");
    await writeFile(join(root, "README.md"), "harness\n", "utf8");
    await git(root, "add", ".");
    await git(root, "commit", "-m", "first skill");
    await git(root, "push", "origin", "HEAD:main");
    await new HarnessGitAdapter().fetch(root);
  }, 30_000);

  afterEach(async () => {
    await removeGitTempTree(base);
  });

  const promoted = async (skill: string, ...args: string[]) =>
    (await git(remote, ...args, `refs/heads/maestro/${skill}`)).stdout.trim();

  it("pushes the edited skill to its own branch, and nothing else with it", async () => {
    // The promotion is built from the fetched tip, so neither can ride along.
    await writeFile(join(root, "notes.md"), "mine\n", "utf8");
    await git(root, "add", "notes.md");
    await git(root, "commit", "-m", "local only");
    await writeFile(join(root, "staged.md"), "staged\n", "utf8");
    await git(root, "add", "staged.md");
    await writeSkill("tdd", "edited on disk");

    await expect(promoter().execute("tdd", AT)).resolves.toEqual({
      ok: true,
      branch: "maestro/tdd",
      pullRequestUrl: expect.stringContaining("/compare/main...maestro/tdd"),
    });

    expect(await promoted("tdd", "log", "-1", "--format=%s")).toBe(
      "Promote skill: tdd",
    );
    const files = await promoted("tdd", "ls-tree", "-r", "--name-only");
    expect(files.split("\n").sort()).toEqual([
      ".apm/skills/tdd/SKILL.md",
      "README.md",
    ]);
    expect(
      (
        await git(
          remote,
          "show",
          "refs/heads/maestro/tdd:.apm/skills/tdd/SKILL.md",
        )
      ).stdout,
    ).toContain("edited on disk");
  });

  it("starts from the fetched tip, so a teammate's merged work is kept", async () => {
    const other = join(base, "other");
    await run("git", ["clone", remote, other]);
    await git(other, "config", "user.email", "mate@example.com");
    await git(other, "config", "user.name", "Mate");
    await writeFile(join(other, "theirs.md"), "theirs\n", "utf8");
    await git(other, "add", ".");
    await git(other, "commit", "-m", "team change");
    await git(other, "push", "origin", "HEAD:main");
    await writeSkill("tdd", "edited on disk");

    await expect(promoter().execute("tdd", AT)).resolves.toMatchObject({
      ok: true,
    });

    const files = await promoted("tdd", "ls-tree", "-r", "--name-only");
    expect(files).toContain("theirs.md");
    expect(
      (
        await git(remote, "rev-parse", "refs/heads/maestro/tdd~1")
      ).stdout.trim(),
    ).toBe((await git(other, "rev-parse", "HEAD")).stdout.trim());
  });

  it("promotes a skill that exists only as untracked files on disk", async () => {
    await writeSkill("jobs", "brand new");

    await expect(promoter().execute("jobs", AT)).resolves.toMatchObject({
      ok: true,
      branch: "maestro/jobs",
    });

    const files = await promoted("jobs", "ls-tree", "-r", "--name-only");
    expect(files.split("\n").sort()).toEqual([
      ".apm/skills/jobs/SKILL.md",
      ".apm/skills/tdd/SKILL.md",
      "README.md",
    ]);
  });

  it("runs none of the clone's own hooks, which are the author's and not this push's", async () => {
    // A pre-push hook may write in the tree or fail after the remote took the
    // push; neither may touch the checkout.
    await writeFile(
      join(root, ".git", "hooks", "pre-push"),
      "#!/bin/sh\necho hooked > hooked.md\n",
      { mode: 0o755 },
    );
    await writeSkill("tdd", "edited on disk");

    await expect(promoter().execute("tdd", AT)).resolves.toMatchObject({
      ok: true,
    });

    await expect(access(join(root, "hooked.md"))).rejects.toThrow();
  });

  it("leaves HEAD, the real index, and the working tree exactly as they were", async () => {
    await writeFile(join(root, "staged.md"), "staged\n", "utf8");
    await git(root, "add", "staged.md");
    await writeSkill("tdd", "edited on disk");
    const head = (await git(root, "rev-parse", "HEAD")).stdout.trim();
    const status = (await git(root, "status", "--porcelain")).stdout;
    const branches = (await git(root, "branch", "--list")).stdout;

    await promoter().execute("tdd", AT);

    expect((await git(root, "rev-parse", "HEAD")).stdout.trim()).toBe(head);
    expect((await git(root, "status", "--porcelain")).stdout).toBe(status);
    expect((await git(root, "branch", "--list")).stdout).toBe(branches);
  });

  it("moves the skill into Pending review, so a refresh reads it back", async () => {
    await writeSkill("tdd", "edited on disk");

    await promoter().execute("tdd", AT);
    await new HarnessGitAdapter().fetch(root);

    const trees = await new HarnessGitAdapter().readMovementTrees(root);
    expect(trees?.promote.tdd?.tree).toBe(trees?.working.tdd);
    expect(trees?.promote.tdd?.tree).not.toBe(trees?.remote.tdd);
  });

  it("reports a skill the working harness does not have", async () => {
    await expect(promoter().execute("absent", AT)).resolves.toEqual({
      ok: false,
      error: "skill-missing",
    });
  });

  it("appends a second promotion onto the existing branch, keeping both commits", async () => {
    await writeSkill("tdd", "first edit");
    await expect(promoter().execute("tdd", AT)).resolves.toMatchObject({
      ok: true,
    });
    const first = await promoted("tdd", "rev-parse");

    // A teammate's merge lands between the two promotions, so the second tree
    // must come from the freshest fetched tip.
    const other = join(base, "other");
    await run("git", ["clone", remote, other]);
    await git(other, "config", "user.email", "mate@example.com");
    await git(other, "config", "user.name", "Mate");
    await writeFile(join(other, "theirs.md"), "theirs\n", "utf8");
    await git(other, "add", ".");
    await git(other, "commit", "-m", "team change");
    await git(other, "push", "origin", "HEAD:main");
    await writeSkill("tdd", "second edit");

    await expect(promoter().execute("tdd", AT)).resolves.toMatchObject({
      ok: true,
      branch: "maestro/tdd",
    });

    const second = await promoted("tdd", "rev-parse");
    expect(second).not.toBe(first);
    expect(
      (
        await git(remote, "rev-parse", "refs/heads/maestro/tdd~1")
      ).stdout.trim(),
    ).toBe(first);
    expect(
      (
        await git(remote, "rev-list", "--count", "main..refs/heads/maestro/tdd")
      ).stdout.trim(),
    ).toBe("2");
    const files = await promoted("tdd", "ls-tree", "-r", "--name-only");
    expect(files.split("\n").sort()).toEqual([
      ".apm/skills/tdd/SKILL.md",
      "README.md",
      "theirs.md",
    ]);
    expect(
      (
        await git(
          remote,
          "show",
          "refs/heads/maestro/tdd:.apm/skills/tdd/SKILL.md",
        )
      ).stdout,
    ).toContain("second edit");
  });

  it("settles a second promotion whose reply was lost, without stacking a duplicate commit", async () => {
    await writeSkill("tdd", "first edit");
    await promoter().execute("tdd", AT);
    const first = await promoted("tdd", "rev-parse");

    // The push errors after the remote already took the branch (#577).
    const script = join(base, "receive-pack.sh");
    await writeFile(script, '#!/bin/sh\ngit-receive-pack "$@"\nexit 1\n', {
      encoding: "utf8",
      mode: 0o755,
    });
    await git(root, "config", "remote.origin.receivepack", script);
    await writeSkill("tdd", "second edit");

    await expect(promoter().execute("tdd", AT)).resolves.toEqual({
      ok: true,
      branch: "maestro/tdd",
      pullRequestUrl: expect.stringContaining("/compare/main...maestro/tdd"),
    });

    expect(
      (
        await git(remote, "rev-list", "--count", "main..refs/heads/maestro/tdd")
      ).stdout.trim(),
    ).toBe("2");
    expect(
      (
        await git(remote, "rev-parse", "refs/heads/maestro/tdd~1")
      ).stdout.trim(),
    ).toBe(first);
  });

  it("publishes no new commit when a press finds the branch already carries its content", async () => {
    await writeSkill("tdd", "edited on disk");
    await promoter().execute("tdd", AT);
    const first = await promoted("tdd", "rev-parse");

    await expect(promoter().execute("tdd", AT)).resolves.toMatchObject({
      ok: true,
      branch: "maestro/tdd",
    });

    expect(await promoted("tdd", "rev-parse")).toBe(first);
    expect(
      (
        await git(remote, "rev-list", "--count", "main..refs/heads/maestro/tdd")
      ).stdout.trim(),
    ).toBe("1");
  });

  it("leaves the repository untouched when a promote push is rejected, and a retry appends cleanly", async () => {
    await writeSkill("tdd", "first edit");
    await expect(promoter().execute("tdd", AT)).resolves.toMatchObject({
      ok: true,
    });
    const first = await promoted("tdd", "rev-parse");

    await writeFile(
      join(remote, "hooks", "pre-receive"),
      "#!/bin/sh\nexit 1\n",
      { mode: 0o755 },
    );
    await writeFile(join(root, "staged.md"), "staged\n", "utf8");
    await git(root, "add", "staged.md");
    const head = (await git(root, "rev-parse", "HEAD")).stdout.trim();
    const status = (await git(root, "status", "--porcelain")).stdout;
    const branches = (await git(root, "branch", "--list")).stdout;
    await writeSkill("tdd", "second edit");

    await expect(promoter().execute("tdd", AT)).resolves.toEqual({
      ok: false,
      error: "promote-failed",
    });

    expect(await promoted("tdd", "rev-parse")).toBe(first);
    expect((await git(root, "rev-parse", "HEAD")).stdout.trim()).toBe(head);
    expect((await git(root, "status", "--porcelain")).stdout).toBe(status);
    expect((await git(root, "branch", "--list")).stdout).toBe(branches);

    // A fresh press by the test, not a retry the code triggered.
    await rm(join(remote, "hooks", "pre-receive"));
    await expect(promoter().execute("tdd", AT)).resolves.toMatchObject({
      ok: true,
    });
    expect(
      (
        await git(remote, "rev-list", "--count", "main..refs/heads/maestro/tdd")
      ).stdout.trim(),
    ).toBe("2");
  });

  // A push that errors after the remote moved the branch; reported as a
  // failure, the retry's second commit would be refused (#577).
  it("reads a push that failed after the remote took the branch as pushed", async () => {
    const script = join(base, "receive-pack.sh");
    await writeFile(script, '#!/bin/sh\ngit-receive-pack "$@"\nexit 1\n', {
      encoding: "utf8",
      mode: 0o755,
    });
    await git(root, "config", "remote.origin.receivepack", script);
    await writeSkill("tdd", "edited on disk");

    await expect(promoter().execute("tdd", AT)).resolves.toEqual({
      ok: true,
      branch: "maestro/tdd",
      pullRequestUrl: expect.stringContaining("/compare/main...maestro/tdd"),
    });

    expect(
      (
        await git(
          remote,
          "show",
          "refs/heads/maestro/tdd:.apm/skills/tdd/SKILL.md",
        )
      ).stdout,
    ).toContain("edited on disk");
  });

  it("refuses when the skill changes on disk while it is being read", async () => {
    // A clean filter that edits the file it filters, like an editor save
    // mid-read.
    const mutate = join(base, "mutate.sh");
    await writeFile(mutate, "#!/bin/sh\ncat\necho later >> $1\n", {
      mode: 0o755,
    });
    await writeSkill("tdd", "edited on disk");
    await writeFile(
      join(root, ".gitattributes"),
      ".apm/skills/tdd/* filter=mutate\n",
      "utf8",
    );
    await git(root, "config", "filter.mutate.clean", `${mutate} %f`);

    await expect(promoter().execute("tdd", AT)).resolves.toEqual({
      ok: false,
      error: "source-changed",
    });

    await expect(
      git(remote, "rev-parse", "--verify", "refs/heads/maestro/tdd"),
    ).rejects.toThrow();
  });

  it("refuses when the push would land in a repository the link never names", async () => {
    // A fork push-url over an upstream fetch-url would publish to `fork.git`
    // while the link points into origin.
    const fork = join(base, "fork.git");
    await run("git", ["init", "--bare", "-b", "main", fork]);
    await git(root, "config", "remote.origin.pushurl", fork);
    await writeSkill("tdd", "edited on disk");

    await expect(promoter().execute("tdd", AT)).resolves.toEqual({
      ok: false,
      error: "push-elsewhere",
    });

    expect(
      (await git(fork, "for-each-ref", "--format=%(refname)")).stdout.trim(),
    ).toBe("");
  });

  it("keeps a git failure behind a typed value, naming no path or git output", async () => {
    // `git add` stages nothing, so there is no tree; git's words stay with
    // git and the caller gets a class (#574).
    await writeFile(join(root, ".gitignore"), ".apm/skills/draft/\n", "utf8");
    await writeSkill("draft", "ignored on disk");

    const result = await promoter().execute("draft", AT);

    expect(result).toEqual({ ok: false, error: "promote-failed" });
    expect(JSON.stringify(result)).not.toContain(root);
  });

  it("never reports a no-op press as pushed when another actor moved the branch after the fetch", async () => {
    const git2 = new HarnessGitAdapter();
    const head = (await git(remote, "rev-parse", "main")).stdout.trim();
    await writeSkill("tdd", "first edit");
    await expect(git2.pushSkillPromotion(root, "tdd", head)).resolves.toBe(
      "pushed",
    );
    const first = await promoted("tdd", "rev-parse");

    const other = join(base, "other");
    await run("git", ["clone", remote, other]);
    await git(other, "config", "user.email", "mate@example.com");
    await git(other, "config", "user.name", "Mate");
    await git(other, "checkout", "maestro/tdd");
    await writeFile(
      join(other, ".apm", "skills", "tdd", "SKILL.md"),
      "---\ndescription: concurrent edit\n---\n",
      "utf8",
    );
    await git(other, "commit", "-am", "concurrent edit");
    await git(other, "push", "origin", "HEAD:refs/heads/maestro/tdd");
    const concurrent = await promoted("tdd", "rev-parse");

    await writeSkill("tdd", "first edit");

    await expect(git2.pushSkillPromotion(root, "tdd", head)).resolves.toBe(
      "pushed",
    );

    expect(await promoted("tdd", "rev-parse")).not.toBe(concurrent);
    expect(
      (
        await git(remote, "rev-parse", "refs/heads/maestro/tdd~1")
      ).stdout.trim(),
    ).toBe(concurrent);
    expect(
      (
        await git(remote, "rev-parse", "refs/heads/maestro/tdd~2")
      ).stdout.trim(),
    ).toBe(first);
    expect(
      (
        await git(
          remote,
          "show",
          "refs/heads/maestro/tdd:.apm/skills/tdd/SKILL.md",
        )
      ).stdout,
    ).toContain("first edit");
  });

  it("refuses a no-op press when the skill mutates again while it is being re-verified", async () => {
    await writeSkill("tdd", "stable content");
    await promoter().execute("tdd", AT);

    // The file is untouched on the first read, so the no-op shortcut would
    // fire, but it changes before a second read.
    const mutate = join(base, "mutate.sh");
    await writeFile(mutate, "#!/bin/sh\ncat\necho later >> $1\n", {
      mode: 0o755,
    });
    await writeFile(
      join(root, ".gitattributes"),
      ".apm/skills/tdd/* filter=mutate\n",
      "utf8",
    );
    await git(root, "config", "filter.mutate.clean", `${mutate} %f`);

    await expect(promoter().execute("tdd", AT)).resolves.toEqual({
      ok: false,
      error: "source-changed",
    });

    expect(
      (
        await git(remote, "rev-list", "--count", "main..refs/heads/maestro/tdd")
      ).stdout.trim(),
    ).toBe("1");
  });

  it("settles a promote whose reply was lost even when another actor fast-forwards it first", async () => {
    await writeSkill("tdd", "first edit");
    await promoter().execute("tdd", AT);
    const first = await promoted("tdd", "rev-parse");

    // Another actor fast-forwards the branch before the reply gets back.
    const script = join(base, "receive-pack.sh");
    await writeFile(
      script,
      [
        "#!/bin/sh",
        'git-receive-pack "$@"',
        'REPO="$1"',
        'TIP=$(git -C "$REPO" rev-parse refs/heads/maestro/tdd)',
        'TREE=$(git -C "$REPO" rev-parse "$TIP^{tree}")',
        'NEXT=$(echo "advanced by a teammate" | git -C "$REPO" commit-tree "$TREE" -p "$TIP")',
        'git -C "$REPO" update-ref refs/heads/maestro/tdd "$NEXT"',
        "exit 1",
        "",
      ].join("\n"),
      { encoding: "utf8", mode: 0o755 },
    );
    await git(root, "config", "remote.origin.receivepack", script);
    await writeSkill("tdd", "second edit");

    await expect(promoter().execute("tdd", AT)).resolves.toEqual({
      ok: true,
      branch: "maestro/tdd",
      pullRequestUrl: expect.stringContaining("/compare/main...maestro/tdd"),
    });

    expect(
      (
        await git(remote, "rev-list", "--count", "main..refs/heads/maestro/tdd")
      ).stdout.trim(),
    ).toBe("3");
    expect(
      (
        await git(remote, "rev-parse", "refs/heads/maestro/tdd~2")
      ).stdout.trim(),
    ).toBe(first);
  });

  it("reports a remote that could not be reached, and records the failed fetch", async () => {
    // Only what git resolves the origin to is gone: unreachable, not unusable.
    await git(root, "config", "--unset", `url.${remote}.insteadOf`);
    await git(
      root,
      "config",
      `url.${join(base, "gone.git")}.insteadOf`,
      ORIGIN_URL,
    );
    await writeSkill("tdd", "edited on disk");

    await expect(promoter().execute("tdd", AT)).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });

    expect(freshness.outcome).toBe("fetch-failed");
  });
});
