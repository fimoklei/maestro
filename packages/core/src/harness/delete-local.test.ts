import { describe, expect, it } from "vitest";
import { InFlightLocks } from "../deploy/in-flight-locks";
import { DeleteLocal } from "./delete-local";
import { harnessDisk } from "./harness-disk.fake";
import {
  blobHash,
  InMemoryHarnessGit,
  skillRef,
  treeHash,
} from "./harness-git.fake";

const ROOT = "/harness";
const SKILLS = "/harness/.apm/skills";
const FOLDER = `${SKILLS}/tdd`;
const SEEN = treeHash("working-tdd");
const PROMPT = { type: "prompt", name: "pr-review" } as const;
const PROMPT_FILE = "/harness/.maestro/prompts/pr-review.md";
const OTHER_FILE = "/harness/.maestro/prompts/other.md";

// `tdd` exists only on disk; `jobs` has a local commit origin/HEAD lacks.
const localOnlyWorld = () => {
  const git = new InMemoryHarnessGit();
  git.commit("remote", { jobs: "remote-jobs" });
  git.commit("local", { jobs: "local-jobs" }, { parent: "remote" });
  git.tip = "remote";
  git.head = "local";
  git.working = { jobs: "local-jobs", tdd: "working-tdd" };
  return git;
};

function build(
  git: InMemoryHarnessGit,
  overrides?: {
    root?: string | undefined;
    disk?: Parameters<typeof harnessDisk>[0];
    locks?: InFlightLocks;
  },
) {
  const disk = harnessDisk(overrides?.disk ?? { entries: [FOLDER] });
  const deletion = new DeleteLocal({
    resolveRoot: async () =>
      overrides && "root" in overrides ? overrides.root : ROOT,
    fs: disk,
    git,
    locks: overrides?.locks ?? new InFlightLocks(),
  });
  return { deletion, disk };
}

describe("DeleteLocal", () => {
  it("removes the skill's own folder from the Working Harness", async () => {
    const { deletion, disk } = build(localOnlyWorld());

    await expect(deletion.execute(skillRef("tdd"), SEEN)).resolves.toEqual({
      ok: true,
      name: "tdd",
    });
    expect(await disk.exists(FOLDER)).toBe(false);
  });

  it("fetches nothing and pushes nothing", async () => {
    const git = localOnlyWorld();
    const { deletion } = build(git);

    await expect(deletion.execute(skillRef("tdd"), SEEN)).resolves.toEqual({
      ok: true,
      name: "tdd",
    });
    expect(git.fetches).toBe(0);
    expect(git.pushed).toEqual([]);
    expect(git.published).toEqual([]);
  });

  it("refuses a skill that is already off the working tree", async () => {
    const git = localOnlyWorld();
    git.working = { jobs: "local-jobs" };
    const { deletion, disk } = build(git);

    await expect(deletion.execute(skillRef("tdd"), SEEN)).resolves.toEqual({
      ok: false,
      error: "already-gone",
    });
    expect(await disk.exists(FOLDER)).toBe(true);
  });

  it.each<[string, (git: InMemoryHarnessGit) => void]>([
    [
      "a proposal branch",
      (git) => {
        git.commit("tdd-tip", { tdd: "branch-tdd" }, { parent: "remote" });
        git.promote = { tdd: "tdd-tip" };
      },
    ],
    [
      "a tree on origin/HEAD",
      (git) => {
        git.commit("remote-tdd", { jobs: "remote-jobs", tdd: "remote-tdd" });
        git.tip = "remote-tdd";
      },
    ],
    [
      "a commit on local HEAD",
      (git) => {
        git.commit("local-tdd", { jobs: "local-jobs", tdd: "local-tdd" });
        git.head = "local-tdd";
      },
    ],
  ])("removes a skill that %s also holds", async (_what, holds) => {
    const git = localOnlyWorld();
    holds(git);
    const { deletion, disk } = build(git);

    await expect(deletion.execute(skillRef("tdd"), SEEN)).resolves.toEqual({
      ok: true,
      name: "tdd",
    });
    expect(await disk.exists(FOLDER)).toBe(false);
  });

  // Fail-closed: a clone nobody could read is not proof of what the folder holds.
  it("refuses when the clone cannot be read", async () => {
    const git = localOnlyWorld();
    git.unreadable.add("HEAD");
    const { deletion, disk } = build(git);

    await expect(deletion.execute(skillRef("tdd"), SEEN)).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
    expect(await disk.exists(FOLDER)).toBe(true);
  });

  it("refuses a folder that changed after the check", async () => {
    const { deletion, disk } = build(localOnlyWorld());

    await expect(
      deletion.execute(skillRef("tdd"), treeHash("earlier-tdd")),
    ).resolves.toEqual({
      ok: false,
      error: "confirmation-stale",
    });
    expect(await disk.exists(FOLDER)).toBe(true);
  });

  it("refuses a skill folder that is a link, leaving the link in place", async () => {
    const { deletion, disk } = build(localOnlyWorld(), {
      disk: { links: { [FOLDER]: "/elsewhere" } },
    });

    await expect(deletion.execute(skillRef("tdd"), SEEN)).resolves.toEqual({
      ok: false,
      error: "destination-unsafe",
    });
    expect(await disk.exists(FOLDER)).toBe(true);
  });

  it("refuses a prompt that links to another prompt in its folder", async () => {
    const git = localOnlyWorld();
    git.workingPrompts = { "pr-review": "review", other: "other" };
    const { deletion, disk } = build(git, {
      disk: { entries: [OTHER_FILE], links: { [PROMPT_FILE]: OTHER_FILE } },
    });

    await expect(deletion.execute(PROMPT, blobHash("review"))).resolves.toEqual(
      { ok: false, error: "destination-unsafe" },
    );
    expect(await disk.exists(PROMPT_FILE)).toBe(true);
    expect(await disk.isFileEntry(OTHER_FILE)).toBe(true);
  });

  // Real git lists no link as a prompt, so it must not read as already gone.
  it("refuses a linked prompt the clone's listing leaves out", async () => {
    const { deletion, disk } = build(localOnlyWorld(), {
      disk: { links: { [PROMPT_FILE]: OTHER_FILE } },
    });

    await expect(deletion.execute(PROMPT, blobHash("review"))).resolves.toEqual(
      { ok: false, error: "destination-unsafe" },
    );
    expect(await disk.exists(PROMPT_FILE)).toBe(true);
  });

  it("reports a removal the filesystem refused", async () => {
    const { deletion } = build(localOnlyWorld(), {
      disk: { entries: [FOLDER], unremovable: [FOLDER] },
    });

    await expect(deletion.execute(skillRef("tdd"), SEEN)).resolves.toEqual({
      ok: false,
      error: "delete-failed",
    });
  });

  it("refuses a skill whose skills folder cannot be read", async () => {
    const { deletion, disk } = build(localOnlyWorld(), {
      disk: { entries: [FOLDER], unreadable: [SKILLS] },
    });

    await expect(deletion.execute(skillRef("tdd"), SEEN)).resolves.toEqual({
      ok: false,
      error: "destination-unreadable",
    });
    expect(await disk.exists(FOLDER)).toBe(true);
  });

  it("refuses a skill whose skills folder is gone as already gone", async () => {
    const git = localOnlyWorld();
    git.working = { jobs: "local-jobs" };
    const { deletion } = build(git, { disk: { missing: [SKILLS] } });

    await expect(deletion.execute(skillRef("tdd"), SEEN)).resolves.toEqual({
      ok: false,
      error: "already-gone",
    });
  });

  it("refuses while another Harness action holds the root's lock", async () => {
    const locks = new InFlightLocks();
    const { deletion } = build(localOnlyWorld(), { locks });

    const held = locks.run(ROOT, () => new Promise<void>(() => {}));
    void held;

    await expect(deletion.execute(skillRef("tdd"), SEEN)).resolves.toEqual({
      ok: false,
      error: "delete-in-progress",
    });
  });

  it("refuses a name that is not a skill slug", async () => {
    const { deletion, disk } = build(localOnlyWorld());

    await expect(deletion.execute(skillRef("../etc"), SEEN)).resolves.toEqual({
      ok: false,
      error: "invalid-skill",
    });
    expect(await disk.exists(FOLDER)).toBe(true);
  });

  it("refuses with no Harness connected", async () => {
    const { deletion, disk } = build(localOnlyWorld(), { root: undefined });

    await expect(deletion.execute(skillRef("tdd"), SEEN)).resolves.toEqual({
      ok: false,
      error: "not-configured",
    });
    expect(await disk.exists(FOLDER)).toBe(true);
  });
});

describe("DeleteLocal.inspect", () => {
  const inspectWorld = () => {
    const git = new InMemoryHarnessGit().settled({
      jobs: "jobs-v1",
      gone: "gone-v1",
      edited: "edited-v1",
    });
    git.working = { jobs: "jobs-v1", edited: "edited-v2", tdd: "working-tdd" };
    return git;
  };

  it("reports, per skill, whether its folder is in the clone and what it holds", async () => {
    const { deletion } = build(inspectWorld());

    await expect(deletion.inspect()).resolves.toEqual({
      ok: true,
      checks: {
        skill: {
          jobs: {
            inClone: true,
            path: ".apm/skills/jobs",
            workingTree: treeHash("jobs-v1"),
            uncommitted: false,
            localOnly: false,
          },
          edited: {
            inClone: true,
            path: ".apm/skills/edited",
            workingTree: treeHash("edited-v2"),
            uncommitted: true,
            localOnly: false,
          },
          tdd: {
            inClone: true,
            path: ".apm/skills/tdd",
            workingTree: SEEN,
            uncommitted: true,
            localOnly: true,
          },
          gone: { inClone: false },
        },
        prompt: {},
      },
    });
  });

  // #1597: the dialog states the path the server names, per type.
  it("names the Harness path of each folder or file in the clone", async () => {
    const git = inspectWorld();
    git.workingPrompts = { tdd: "prompt-tdd" };
    const { deletion } = build(git);

    const inspected = await deletion.inspect();
    if (!inspected.ok) throw new Error("expected checks");
    expect(inspected.checks.skill.tdd).toMatchObject({
      path: ".apm/skills/tdd",
    });
    expect(inspected.checks.prompt.tdd).toMatchObject({
      path: ".maestro/prompts/tdd.md",
    });
  });

  // Real git lists a link as mode 120000, which is no prompt.
  it("lists no prompt whose working file is a link", async () => {
    const git = inspectWorld();
    git.workingPrompts = { "pr-review": "review", commit: "commit" };
    git.workingPromptLinks.add("pr-review");
    const { deletion } = build(git);

    const inspected = await deletion.inspect();
    if (!inspected.ok) throw new Error("expected checks");
    expect(Object.keys(inspected.checks.prompt)).toEqual(["commit"]);
  });

  it("reports a skill only a proposal branch holds as not in the clone", async () => {
    const git = inspectWorld();
    git.commit("fresh-tip", { fresh: "branch-fresh" }, { parent: "settled" });
    git.promote = { fresh: "fresh-tip" };
    const { deletion } = build(git);

    const result = await deletion.inspect();

    expect(result.ok && result.checks.skill.fresh).toEqual({ inClone: false });
  });

  it("answers no-answer when the clone cannot be read", async () => {
    const git = inspectWorld();
    git.unreadable.add("HEAD");
    const { deletion } = build(git);

    await expect(deletion.inspect()).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
  });

  it("answers not-configured with no Harness connected", async () => {
    const { deletion } = build(inspectWorld(), { root: undefined });

    await expect(deletion.inspect()).resolves.toEqual({
      ok: false,
      error: "not-configured",
    });
  });
});
