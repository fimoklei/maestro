// Withdraw from release pushes one commit to the default branch and follows
// it locally without touching the working tree (#1729).
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { HarnessGitAdapter, ReleasedContentReader } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { git, useHarnessStages } from "../helpers/harness-stages";

const adapter = () =>
  new HarnessGitAdapter({ released: new ReleasedContentReader() });

const tdd = { type: "skill", name: "tdd" } as const;
const review = { type: "skill", name: "review" } as const;

describe("withdrawing on the default branch", { timeout: 40_000 }, () => {
  const stages = useHarnessStages();
  const { writeSkill } = stages;

  const out = async (cwd: string, ...args: string[]) =>
    (await git(cwd, ...args)).stdout.trim();

  const merge = async (message: string) => {
    await git(stages.root, "add", ".");
    await git(stages.root, "commit", "-m", message);
    await git(stages.root, "push", "origin", "HEAD:main");
    await adapter().fetch(stages.root);
  };

  const remoteTip = () => out(stages.remote, "rev-parse", "refs/heads/main");
  const releaseCommit = () => out(stages.root, "rev-parse", "v0.1.0^{commit}");
  const treeOn = (cwd: string, ref: string, path: string) =>
    out(cwd, "rev-parse", `${ref}:${path}`).catch(() => null);
  const skillText = (name: string) =>
    readFile(join(stages.root, ".apm", "skills", name, "SKILL.md"), "utf8");

  const withdraw = async (
    refs: (typeof tdd | typeof review)[],
    over: { tip?: string } = {},
  ) =>
    adapter().withdrawOnDefaultBranch(stages.root, {
      defaultBranch: "main",
      tip: over.tip ?? (await remoteTip()),
      source: await releaseCommit(),
      refs,
      message: "Withdraw skill: tdd",
    });

  it("lands one commit that puts only the item back as released", async () => {
    await writeSkill("tdd", "merged after the release");
    await writeSkill("grill", "a teammate's skill");
    await merge("edit tdd, add grill");
    const before = await remoteTip();

    expect(await withdraw([tdd])).toBe("pushed");

    const after = await remoteTip();
    expect(await out(stages.remote, "rev-parse", `${after}^`)).toBe(before);
    expect(await out(stages.remote, "log", "-1", "--format=%s", after)).toBe(
      "Withdraw skill: tdd",
    );
    expect(await out(stages.remote, "diff", "--name-only", before, after)).toBe(
      ".apm/skills/tdd/SKILL.md",
    );
    expect(await treeOn(stages.remote, after, ".apm/skills/tdd")).toBe(
      await treeOn(stages.remote, "v0.1.0", ".apm/skills/tdd"),
    );
  });

  it("leaves the working tree as it was and follows the push locally", async () => {
    await writeSkill("tdd", "merged after the release");
    await merge("edit tdd");
    await writeSkill("tdd", "edited, never proposed");

    expect(await withdraw([tdd])).toBe("pushed");

    expect(await skillText("tdd")).toContain("edited, never proposed");
    expect(await out(stages.root, "rev-parse", "HEAD")).toBe(await remoteTip());
    expect(
      await out(stages.root, "rev-parse", "refs/remotes/origin/main"),
    ).toBe(await remoteTip());
    // Nothing staged: the author's copy reads as uncommitted work.
    expect(await out(stages.root, "diff", "--cached", "--name-only")).toBe("");
    expect(await out(stages.root, "status", "--porcelain")).toBe(
      "M .apm/skills/tdd/SKILL.md",
    );
  });

  it("keeps the author's copy of an added item through a later catch-up", async () => {
    await writeSkill("review", "new review");
    await merge("add review");

    expect(await withdraw([review])).toBe("pushed");
    await adapter().catchUp(stages.root);

    expect(await skillText("review")).toContain("new review");
    expect(
      await treeOn(stages.remote, "main", ".apm/skills/review"),
    ).toBeNull();
  });

  it("refuses a default branch that moved after the confirmation", async () => {
    await writeSkill("tdd", "merged after the release");
    await merge("edit tdd");
    const seen = await remoteTip();
    await writeSkill("grill", "a teammate's skill");
    await git(stages.root, "add", ".");
    await git(stages.root, "commit", "-m", "teammate");
    await git(stages.root, "push", "origin", "HEAD:main");
    const moved = await remoteTip();
    await git(stages.root, "reset", "-q", "--hard", seen);

    expect(await withdraw([tdd], { tip: seen })).toBe("stale-tip");
    expect(await remoteTip()).toBe(moved);
  });

  it("refuses a clone whose HEAD is not the tip, and writes nothing", async () => {
    await writeSkill("tdd", "merged after the release");
    await merge("edit tdd");
    const tip = await remoteTip();
    await writeSkill("grill", "local only");
    await git(stages.root, "add", ".");
    await git(stages.root, "commit", "-m", "local commit");
    const head = await out(stages.root, "rev-parse", "HEAD");

    expect(await withdraw([tdd], { tip })).toBe("clone-not-current");
    expect(await remoteTip()).toBe(tip);
    expect(await out(stages.root, "rev-parse", "HEAD")).toBe(head);
  });

  it("removes an item from a Harness never released", async () => {
    await rm(join(stages.root, ".apm", "skills", "tdd"), { recursive: true });
    await writeSkill("review", "new review");
    await merge("add review, delete tdd");

    expect(
      await adapter().withdrawOnDefaultBranch(stages.root, {
        defaultBranch: "main",
        tip: await remoteTip(),
        source: null,
        refs: [review],
        message: "Withdraw skill: review",
      }),
    ).toBe("pushed");
    expect(
      await treeOn(stages.remote, "main", ".apm/skills/review"),
    ).toBeNull();
    expect(await skillText("review")).toContain("new review");
  });
});
