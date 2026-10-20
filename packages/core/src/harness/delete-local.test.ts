import { describe, expect, it } from "vitest";
import { InFlightLocks } from "../deploy/in-flight-locks";
import { DeleteLocal } from "./delete-local";
import { InMemoryHarnessGit, skillRef, treeHash } from "./harness-git.fake";

const ROOT = "/harness";
const FOLDER = "/harness/.apm/skills/tdd";
const SEEN = treeHash("working-tdd");

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
    realpath?: (path: string) => Promise<string>;
    removeFails?: boolean;
    locks?: InFlightLocks;
  },
) {
  const removed: string[] = [];
  const deletion = new DeleteLocal({
    resolveRoot: async () =>
      overrides && "root" in overrides ? overrides.root : ROOT,
    fs: {
      realpath: overrides?.realpath ?? (async (path) => path),
      remove: async (path) => {
        if (overrides?.removeFails === true) {
          throw new Error("EACCES");
        }
        removed.push(path);
      },
    },
    git,
    locks: overrides?.locks ?? new InFlightLocks(),
  });
  return { deletion, removed };
}

describe("DeleteLocal", () => {
  it("removes the skill's own folder from the Working Harness", async () => {
    const { deletion, removed } = build(localOnlyWorld());

    await expect(deletion.execute(skillRef("tdd"), SEEN)).resolves.toEqual({
      ok: true,
      name: "tdd",
    });
    expect(removed).toEqual([FOLDER]);
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
    const { deletion, removed } = build(git);

    await expect(deletion.execute(skillRef("tdd"), SEEN)).resolves.toEqual({
      ok: false,
      error: "already-gone",
    });
    expect(removed).toEqual([]);
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
    const { deletion, removed } = build(git);

    await expect(deletion.execute(skillRef("tdd"), SEEN)).resolves.toEqual({
      ok: true,
      name: "tdd",
    });
    expect(removed).toEqual([FOLDER]);
  });

  // Fail-closed: a clone nobody could read is not proof of what the folder holds.
  it("refuses when the clone cannot be read", async () => {
    const git = localOnlyWorld();
    git.unreadable.add("HEAD");
    const { deletion, removed } = build(git);

    await expect(deletion.execute(skillRef("tdd"), SEEN)).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
    expect(removed).toEqual([]);
  });

  it("refuses a folder that changed after the check", async () => {
    const { deletion, removed } = build(localOnlyWorld());

    await expect(
      deletion.execute(skillRef("tdd"), treeHash("earlier-tdd")),
    ).resolves.toEqual({
      ok: false,
      error: "confirmation-stale",
    });
    expect(removed).toEqual([]);
  });

  it("refuses a folder that resolves outside the Harness skills directory", async () => {
    const { deletion, removed } = build(localOnlyWorld(), {
      realpath: async (path) => (path.endsWith("/tdd") ? "/elsewhere" : path),
    });

    await expect(deletion.execute(skillRef("tdd"), SEEN)).resolves.toEqual({
      ok: false,
      error: "destination-unsafe",
    });
    expect(removed).toEqual([]);
  });

  it("reports a removal the filesystem refused", async () => {
    const { deletion } = build(localOnlyWorld(), { removeFails: true });

    await expect(deletion.execute(skillRef("tdd"), SEEN)).resolves.toEqual({
      ok: false,
      error: "delete-failed",
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
    const { deletion, removed } = build(localOnlyWorld());

    await expect(deletion.execute(skillRef("../etc"), SEEN)).resolves.toEqual({
      ok: false,
      error: "invalid-skill",
    });
    expect(removed).toEqual([]);
  });

  it("refuses with no Harness connected", async () => {
    const { deletion, removed } = build(localOnlyWorld(), { root: undefined });

    await expect(deletion.execute(skillRef("tdd"), SEEN)).resolves.toEqual({
      ok: false,
      error: "not-configured",
    });
    expect(removed).toEqual([]);
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
            workingTree: treeHash("jobs-v1"),
            uncommitted: false,
            localOnly: false,
          },
          edited: {
            inClone: true,
            workingTree: treeHash("edited-v2"),
            uncommitted: true,
            localOnly: false,
          },
          tdd: {
            inClone: true,
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
