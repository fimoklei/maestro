// The git questions apm cannot answer, asked against a real local inventory
// clone: does a tag's tree contain skills/<name>? (apm view is repo-level —
// see .claude/rules/apm-driver.md.)
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { InventoryGitAdapter } from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const run = promisify(execFile);

describe("InventoryGitAdapter", () => {
  let root: string;

  const git = (...args: string[]) => run("git", args, { cwd: root });

  const addSkill = async (name: string) => {
    await mkdir(join(root, ".apm", "skills", name), { recursive: true });
    await writeFile(
      join(root, ".apm", "skills", name, "SKILL.md"),
      `---\nname: ${name}\ndescription: A skill\n---\n`,
      "utf8",
    );
  };

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "maestro-inventory-git-"));
    await git("init");
    await git("config", "user.email", "test@example.com");
    await git("config", "user.name", "Test");
    await addSkill("tdd");
    await git("add", ".");
    await git("commit", "-m", "add tdd skill");
    await git("tag", "v0.1.0");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const adapter = () =>
    new InventoryGitAdapter({ resolveRoot: async () => root });

  it("finds a skill that is part of the tag's tree", async () => {
    await expect(adapter().skillExistsAtTag("v0.1.0", "tdd")).resolves.toBe(
      true,
    );
  });

  it("does not find a skill committed after the tag", async () => {
    await addSkill("fresh");
    await git("add", ".");
    await git("commit", "-m", "add fresh skill after the tag");

    await expect(adapter().skillExistsAtTag("v0.1.0", "fresh")).resolves.toBe(
      false,
    );
  });

  it("rejects when the tag does not exist locally, instead of guessing", async () => {
    // A stale clone (tag resolved remotely by apm but never fetched) must
    // surface as an error, not masquerade as "skill not published".
    await expect(adapter().skillExistsAtTag("v9.9.9", "tdd")).rejects.toThrow();
  });

  it("sees no divergence when the working tree matches the tag", async () => {
    await expect(adapter().skillDivergesFromTag("v0.1.0", "tdd")).resolves.toBe(
      false,
    );
  });

  it("detects a tracked file edited since the tag", async () => {
    await writeFile(
      join(root, ".apm", "skills", "tdd", "SKILL.md"),
      "---\nname: tdd\ndescription: Edited locally\n---\n",
      "utf8",
    );

    await expect(adapter().skillDivergesFromTag("v0.1.0", "tdd")).resolves.toBe(
      true,
    );
  });

  it("detects an untracked file added since the tag", async () => {
    // git diff alone misses untracked files; a brand-new reference file in
    // the skill is still drift the tag does not contain.
    await writeFile(
      join(root, ".apm", "skills", "tdd", "extra.md"),
      "new reference\n",
      "utf8",
    );

    await expect(adapter().skillDivergesFromTag("v0.1.0", "tdd")).resolves.toBe(
      true,
    );
  });

  it("detects a skill deleted from disk but still tracked", async () => {
    await rm(join(root, ".apm", "skills", "tdd"), {
      recursive: true,
      force: true,
    });

    await expect(adapter().skillDivergesFromTag("v0.1.0", "tdd")).resolves.toBe(
      true,
    );
  });

  it("ignores changes outside the skill's own directory", async () => {
    await addSkill("other");
    await git("add", ".");
    await git("commit", "-m", "add other skill");

    await expect(adapter().skillDivergesFromTag("v0.1.0", "tdd")).resolves.toBe(
      false,
    );
  });

  it("rejects when no inventory root is configured", async () => {
    const broken = new InventoryGitAdapter({
      resolveRoot: async () => undefined,
    });
    await expect(broken.skillExistsAtTag("v0.1.0", "tdd")).rejects.toThrow();
  });

  // The release side of the local-copy guard: a deployed copy is compared with
  // these hashes file for file, so an equal copy is never read as local edits
  // (#952).
  describe("reading a skill's files at a release", () => {
    const sha = (contents: string) =>
      `sha256:${createHash("sha256").update(contents).digest("hex")}`;
    const SKILL_MD = "---\nname: tdd\ndescription: A skill\n---\n";

    it("hashes every file under the skill, keyed inside the skill folder", async () => {
      await writeFile(
        join(root, ".apm", "skills", "tdd", "reference.md"),
        "how to drive the loop\n",
        "utf8",
      );
      await mkdir(join(root, ".apm", "skills", "tdd", "scripts"));
      await writeFile(
        join(root, ".apm", "skills", "tdd", "scripts", "run.sh"),
        "#!/bin/sh\n",
        "utf8",
      );
      await git("add", ".");
      await git("commit", "-m", "grow the skill");
      await git("tag", "v0.2.0");

      await expect(
        adapter().readSkillFilesAtTag("v0.2.0", "tdd"),
      ).resolves.toEqual({
        "SKILL.md": sha(SKILL_MD),
        "reference.md": sha("how to drive the loop\n"),
        "scripts/run.sh": sha("#!/bin/sh\n"),
      });
    });

    it("reads the release's content, never the working tree's", async () => {
      await writeFile(
        join(root, ".apm", "skills", "tdd", "SKILL.md"),
        "edited after the release\n",
        "utf8",
      );

      await expect(
        adapter().readSkillFilesAtTag("v0.1.0", "tdd"),
      ).resolves.toEqual({ "SKILL.md": sha(SKILL_MD) });
    });

    it("answers null for a tag the clone does not have", async () => {
      await expect(
        adapter().readSkillFilesAtTag("v9.9.9", "tdd"),
      ).resolves.toBeNull();
    });

    it("answers null for a skill the release does not hold", async () => {
      await expect(
        adapter().readSkillFilesAtTag("v0.1.0", "absent"),
      ).resolves.toBeNull();
    });

    it("answers null with no inventory root configured", async () => {
      const broken = new InventoryGitAdapter({
        resolveRoot: async () => undefined,
      });

      await expect(
        broken.readSkillFilesAtTag("v0.1.0", "tdd"),
      ).resolves.toBeNull();
    });
  });
});

describe("InventoryGitAdapter.syncBeforeDeploy", () => {
  // Reproduces #666: a teammate's PR merges and tags on GitHub, but Maestro's
  // own clone — checked out on the default branch, tracking origin — never
  // moves. `git diff <tag> -- path` then reads the just-released skill as
  // untracked-and-missing, and reports it diverged from the tag it *is*.
  let bareRemote: string;
  let root: string;
  let author: string;

  const git = (cwd: string, ...args: string[]) => run("git", args, { cwd });

  const addSkill = async (dir: string, name: string) => {
    await mkdir(join(dir, ".apm", "skills", name), { recursive: true });
    await writeFile(
      join(dir, ".apm", "skills", name, "SKILL.md"),
      `---\nname: ${name}\ndescription: A skill\n---\n`,
      "utf8",
    );
  };

  beforeEach(async () => {
    bareRemote = await mkdtemp(join(tmpdir(), "maestro-inventory-bare-"));
    await run("git", ["init", "--bare", "-b", "main", bareRemote]);

    author = await mkdtemp(join(tmpdir(), "maestro-inventory-author-"));
    await git(author, "clone", bareRemote, ".");
    await git(author, "config", "user.email", "test@example.com");
    await git(author, "config", "user.name", "Test");
    await addSkill(author, "tdd");
    await git(author, "add", ".");
    await git(author, "commit", "-m", "add tdd skill");
    await git(author, "tag", "v0.1.0");
    await git(author, "push", "origin", "main", "v0.1.0");

    // Maestro's own clone, made before the release below — exactly the state
    // left behind right after `promote` pushes a branch and the human merges
    // its PR on GitHub without ever pulling this clone.
    root = await mkdtemp(join(tmpdir(), "maestro-inventory-root-"));
    await git(root, "clone", bareRemote, ".");
  });

  afterEach(async () => {
    await rm(bareRemote, { recursive: true, force: true });
    await rm(author, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  });

  const adapter = () =>
    new InventoryGitAdapter({ resolveRoot: async () => root });

  it("catches up a clean clone left behind by a merged release", async () => {
    await addSkill(author, "fresh");
    await git(author, "add", ".");
    await git(author, "commit", "-m", "add fresh skill");
    await git(author, "tag", "v0.2.0");
    await git(author, "push", "origin", "main", "v0.2.0");

    await expect(
      adapter().skillExistsAtTag("v0.2.0", "fresh"),
    ).rejects.toThrow();

    await adapter().syncBeforeDeploy();

    await expect(adapter().skillExistsAtTag("v0.2.0", "fresh")).resolves.toBe(
      true,
    );
    await expect(
      adapter().skillDivergesFromTag("v0.2.0", "fresh"),
    ).resolves.toBe(false);
  });

  it("reads promote's untracked copy of a released skill as the release it is", async () => {
    // #750: promote commits on a branch, so this clone's `main` lacks the path
    // while a byte-identical copy sits there untracked — which the tracked tree
    // alone reads as the release having been deleted.
    await addSkill(author, "fresh");
    await git(author, "add", ".");
    await git(author, "commit", "-m", "add fresh skill");
    await git(author, "tag", "v0.2.0");
    await git(author, "push", "origin", "main", "v0.2.0");
    await addSkill(root, "fresh");

    await adapter().syncBeforeDeploy();

    await expect(adapter().skillExistsAtTag("v0.2.0", "fresh")).resolves.toBe(
      true,
    );
    await expect(
      adapter().skillDivergesFromTag("v0.2.0", "fresh"),
    ).resolves.toBe(false);
  });

  it("still reports a released skill this clone has neither tracked nor on disk", async () => {
    await addSkill(author, "fresh");
    await git(author, "add", ".");
    await git(author, "commit", "-m", "add fresh skill");
    await git(author, "tag", "v0.2.0");
    await git(author, "push", "origin", "main", "v0.2.0");

    await run("git", ["-C", root, "fetch", "origin", "--tags"]);

    await expect(
      adapter().skillDivergesFromTag("v0.2.0", "fresh"),
    ).resolves.toBe(true);
  });

  it("leaves a clone with real local edits standing, never overwriting them", async () => {
    await writeFile(
      join(root, ".apm", "skills", "tdd", "SKILL.md"),
      "---\nname: tdd\ndescription: Edited locally, never pushed\n---\n",
      "utf8",
    );

    await adapter().syncBeforeDeploy();

    await expect(
      run("git", ["-C", root, "diff", "--", "."]).then(({ stdout }) => stdout),
    ).resolves.not.toBe("");
    await expect(adapter().skillDivergesFromTag("v0.1.0", "tdd")).resolves.toBe(
      true,
    );
  });
});
