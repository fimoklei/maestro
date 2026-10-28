import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { HarnessGitAdapter, ReleasedContentReader } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { git, useHarnessStages } from "../helpers/harness-stages";

const adapter = () =>
  new HarnessGitAdapter({ released: new ReleasedContentReader() });

const tdd = { type: "skill", name: "tdd" } as const;
const review = { type: "skill", name: "review" } as const;
const greet = { type: "prompt", name: "greet" } as const;

describe("working differences through the git adapter", {
  timeout: 40_000,
}, () => {
  const stages = useHarnessStages();
  const { writeSkill } = stages;

  const writeFileIn = async (relative: string, text: string) => {
    const path = join(stages.root, relative);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, text, "utf8");
  };
  const head = async () =>
    (
      await git(stages.root, "rev-parse", "refs/remotes/origin/HEAD")
    ).stdout.trim();

  it("names nothing while the working tree equals the commit", async () => {
    expect(
      await adapter().readWorkingDifferences(stages.root, [tdd], await head()),
    ).toEqual([]);
  });

  it("names changed and untracked files, but not a removed one or another primitive's", async () => {
    await writeFileIn(".apm/skills/tdd/old.md", "committed\n");
    await git(stages.root, "add", ".");
    await git(stages.root, "commit", "-m", "old file");
    await git(stages.root, "push", "origin", "HEAD:main");
    await git(stages.root, "fetch", "origin");
    await writeSkill("tdd", "edited");
    await writeFileIn(".apm/skills/tdd/references/ naïve notes.md", "new\n");
    await rm(join(stages.root, ".apm/skills/tdd/old.md"));
    await writeSkill("other", "not asked about");

    expect(
      await adapter().readWorkingDifferences(stages.root, [tdd], await head()),
    ).toEqual([
      ".apm/skills/tdd/SKILL.md",
      ".apm/skills/tdd/references/ naïve notes.md",
    ]);
  });

  it("names a folder and a prompt the commit lacks, across every name asked", async () => {
    await writeSkill("review", "untracked");
    await writeFileIn(".maestro/prompts/greet.md", "hello\n");

    expect(
      await adapter().readWorkingDifferences(
        stages.root,
        [tdd, review, greet],
        await head(),
      ),
    ).toEqual([".apm/skills/review/SKILL.md", ".maestro/prompts/greet.md"]);
  });

  it("names nothing for a primitive gone from the disk", async () => {
    await rm(join(stages.root, ".apm/skills/tdd"), { recursive: true });

    expect(
      await adapter().readWorkingDifferences(stages.root, [tdd], await head()),
    ).toEqual([]);
  });

  it("leaves the real index untouched", async () => {
    await writeSkill("tdd", "edited");
    await adapter().readWorkingDifferences(stages.root, [tdd], await head());

    const staged = await git(stages.root, "diff", "--cached", "--name-only");
    expect(staged.stdout).toBe("");
  });

  it("gives no answer for a commit it cannot read", async () => {
    expect(
      await adapter().readWorkingDifferences(
        stages.root,
        [tdd],
        "f".repeat(40),
      ),
    ).toBeNull();
  });
});
