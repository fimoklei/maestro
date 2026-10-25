import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { HarnessGitAdapter, ReleasedContentReader } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { git, useHarnessStages } from "../helpers/harness-stages";

const adapter = () =>
  new HarnessGitAdapter({ released: new ReleasedContentReader() });

const tdd = { type: "skill", name: "tdd" } as const;

describe("withdrawing through the git adapter", { timeout: 40_000 }, () => {
  const stages = useHarnessStages();
  const { writeSkill, makeApp, promote } = stages;

  const writeFileIn = async (relative: string, text: string) => {
    const path = join(stages.root, relative);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, text, "utf8");
  };

  describe("files a withdrawal would lose", () => {
    it("names nothing while the folder equals its proposal branch", async () => {
      await writeSkill("tdd", "proposed");
      await promote(makeApp(), "tdd");

      expect(await adapter().readUnproposedFiles(stages.root, tdd)).toEqual([]);
    });

    it("names changed and new files, untracked ones included, but not a removed one", async () => {
      await writeSkill("tdd", "proposed");
      await writeFileIn(".apm/skills/tdd/old.md", "kept on the branch\n");
      await promote(makeApp(), "tdd");
      await writeSkill("tdd", "edited after proposing");
      await writeFileIn(".apm/skills/tdd/references/notes.md", "new\n");
      await writeFileIn(".apm/skills/tdd/ naïve name.md", "odd name\n");
      await rm(join(stages.root, ".apm/skills/tdd/old.md"));

      expect(await adapter().readUnproposedFiles(stages.root, tdd)).toEqual([
        " naïve name.md",
        "SKILL.md",
        "references/notes.md",
      ]);
    });

    it("names a folder put back after its deletion was proposed", async () => {
      await rm(join(stages.root, ".apm/skills/tdd"), { recursive: true });
      const base = (
        await git(stages.root, "rev-parse", "refs/remotes/origin/HEAD")
      ).stdout.trim();
      expect(await adapter().pushDeletion(stages.root, tdd, base)).toBe(
        "pushed",
      );
      await writeSkill("tdd", "back again");

      expect(await adapter().readUnproposedFiles(stages.root, tdd)).toEqual([
        "SKILL.md",
      ]);
    });

    it("names a prompt by its file name", async () => {
      const prompt = { type: "prompt", name: "review" } as const;
      await writeFileIn(".maestro/prompts/review.md", "first\n");
      await makeApp().request("/api/harness/promote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(prompt),
      });
      await writeFileIn(".maestro/prompts/review.md", "second\n");

      expect(await adapter().readUnproposedFiles(stages.root, prompt)).toEqual([
        "review.md",
      ]);
    });

    it("gives no answer without a fetched proposal branch", async () => {
      expect(await adapter().readUnproposedFiles(stages.root, tdd)).toBeNull();
    });
  });

  describe("who authored the proposal branch", () => {
    const base = async () =>
      (
        await git(stages.root, "rev-parse", "refs/remotes/origin/HEAD")
      ).stdout.trim();

    it("reads a branch this clone pushed as authored here", async () => {
      await writeSkill("tdd", "proposed");
      await promote(makeApp(), "tdd");

      expect(
        await adapter().readAuthoredHere(stages.root, tdd, await base()),
      ).toBe("own");
    });

    it("reads a branch under another author email as not authored here", async () => {
      await writeSkill("tdd", "proposed");
      await promote(makeApp(), "tdd");
      await git(stages.root, "config", "user.email", "Teammate@Example.com");

      expect(
        await adapter().readAuthoredHere(stages.root, tdd, await base()),
      ).toBe("others");
    });

    it("matches the author email whatever its case", async () => {
      await writeSkill("tdd", "proposed");
      await promote(makeApp(), "tdd");
      await git(stages.root, "config", "user.email", "TEST@example.com");

      expect(
        await adapter().readAuthoredHere(stages.root, tdd, await base()),
      ).toBe("own");
    });

    it("gives no answer without a fetched proposal branch", async () => {
      expect(
        await adapter().readAuthoredHere(stages.root, tdd, await base()),
      ).toBe("unknown");
    });

    it("names a clone with no author email set", async () => {
      await writeSkill("tdd", "proposed");
      await promote(makeApp(), "tdd");
      await git(stages.root, "config", "user.email", "");

      expect(
        await adapter().readAuthoredHere(stages.root, tdd, await base()),
      ).toBe("no-email");
    });

    it("carries the answer on the proposal ref the stages read", async () => {
      await writeSkill("tdd", "proposed");
      await promote(makeApp(), "tdd");
      await git(stages.root, "config", "user.email", "teammate@example.com");

      const trees = await adapter().readMovementTrees(stages.root);
      expect(trees?.skill.promote.tdd?.authorship).toBe("others");
    });
  });

  describe("deleting the proposal branch", () => {
    it("deletes the branch on the remote and its fetched copy", async () => {
      await writeSkill("tdd", "proposed");
      await promote(makeApp(), "tdd");

      expect(await adapter().deleteProposalBranch(stages.root, tdd)).toBe(
        "deleted",
      );
      const remote = await git(stages.remote, "branch", "--list", "maestro/*");
      const local = await git(
        stages.root,
        "for-each-ref",
        "refs/remotes/origin/maestro",
      );
      expect(remote.stdout).toBe("");
      expect(local.stdout).toBe("");
    });

    it("counts a branch already gone as deleted", async () => {
      expect(await adapter().deleteProposalBranch(stages.root, tdd)).toBe(
        "deleted",
      );
    });
  });
});
