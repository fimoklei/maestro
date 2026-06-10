// The git questions apm cannot answer, asked against a real local inventory
// clone: does a tag's tree contain skills/<name>? (apm view is repo-level —
// see .claude/rules/apm-driver.md.)
import { execFile } from "node:child_process";
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
    await mkdir(join(root, "skills", name), { recursive: true });
    await writeFile(
      join(root, "skills", name, "SKILL.md"),
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
      join(root, "skills", "tdd", "SKILL.md"),
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
      join(root, "skills", "tdd", "extra.md"),
      "new reference\n",
      "utf8",
    );

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
});
