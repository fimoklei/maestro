import { describe, expect, it } from "vitest";
import { InFlightLocks } from "../deploy/in-flight-locks";
import { DeleteLocalSkill } from "./delete-local-skill";
import type { HarnessReviewPort } from "./harness-review-port";
import type { HarnessGitPort, HarnessSkillTrees } from "./read-harness-state";

const ROOT = "/harness";
const FOLDER = "/harness/.apm/skills/tdd";

const onBranch = (tree: string | null) => ({ tree, commit: "branch-tip" });

const LOCAL_ONLY: HarnessSkillTrees = {
  remote: { jobs: "remote-jobs" },
  promote: {},
  local: { jobs: "local-jobs" },
  working: { jobs: "local-jobs", tdd: "working-tdd" },
};

type Calls = { git: string[]; review: string[] };

function build(overrides?: {
  root?: string | undefined;
  trees?: HarnessSkillTrees | null;
  realpath?: (path: string) => Promise<string>;
  onRemove?: (path: string) => void;
  removeFails?: boolean;
  locks?: InFlightLocks;
}) {
  const calls: Calls = { git: [], review: [] };
  const removed: string[] = [];
  const record =
    (kind: keyof Calls, name: string) => async (): Promise<never> => {
      calls[kind].push(name);
      throw new Error(`${name} must not be called`);
    };
  const git: HarnessGitPort = {
    fetch: record("git", "fetch"),
    readFacts: record("git", "readFacts"),
    catchUp: record("git", "catchUp"),
    readCloneSync: record("git", "readCloneSync"),
    readSkillTrees: record("git", "readSkillTrees"),
    readSkillAuthors: record("git", "readSkillAuthors"),
    readMovementTrees: async () =>
      overrides && "trees" in overrides
        ? (overrides.trees ?? null)
        : LOCAL_ONLY,
    mergeBaseCommit: record("git", "mergeBaseCommit"),
    readSkillManifests: record("git", "readSkillManifests"),
    publishTag: record("git", "publishTag"),
    pushSkillPromotion: record("git", "pushSkillPromotion"),
    pushSkillDeletion: record("git", "pushSkillDeletion"),
    readWorktreeAmbiguity: record("git", "readWorktreeAmbiguity"),
    readLocalHeadCommit: record("git", "readLocalHeadCommit"),
    readStagedSkillDifference: record("git", "readStagedSkillDifference"),
    writeSkillTreeInto: record("git", "writeSkillTreeInto"),
  };
  const review: HarnessReviewPort = {
    readReviews: record("review", "readReviews"),
    createRequest: record("review", "createRequest"),
    reopenRequest: record("review", "reopenRequest"),
    closeRequest: record("review", "closeRequest"),
  };
  const deletion = new DeleteLocalSkill({
    resolveRoot: async () =>
      overrides && "root" in overrides ? overrides.root : ROOT,
    fs: {
      realpath: overrides?.realpath ?? (async (path) => path),
      remove: async (path) => {
        overrides?.onRemove?.(path);
        if (overrides?.removeFails === true) {
          throw new Error("EACCES");
        }
        removed.push(path);
      },
    },
    git,
    locks: overrides?.locks ?? new InFlightLocks(),
  });
  return { deletion, calls, removed, review };
}

describe("DeleteLocalSkill", () => {
  it("removes the skill's own folder from the Working Harness", async () => {
    const { deletion, removed } = build();

    await expect(deletion.execute("tdd", "working-tdd")).resolves.toEqual({
      ok: true,
      name: "tdd",
    });
    expect(removed).toEqual([FOLDER]);
  });

  it("pushes nothing, branches nothing and opens no pull request", async () => {
    const { deletion, calls } = build();

    await expect(deletion.execute("tdd", "working-tdd")).resolves.toEqual({
      ok: true,
      name: "tdd",
    });
    expect(calls).toEqual({ git: [], review: [] });
  });

  it("refuses a skill that is already off the working tree", async () => {
    const { deletion, removed } = build({
      trees: { ...LOCAL_ONLY, working: { jobs: "local-jobs" } },
    });

    await expect(deletion.execute("tdd", "working-tdd")).resolves.toEqual({
      ok: false,
      error: "already-gone",
    });
    expect(removed).toEqual([]);
  });

  it.each([
    ["a proposal branch", { promote: { tdd: onBranch("branch-tdd") } }],
    ["a tree on origin/HEAD", { remote: { tdd: "remote-tdd" } }],
    ["a commit on local HEAD", { local: { tdd: "local-tdd" } }],
  ])("refuses a skill that %s still holds", async (_what, over) => {
    const { deletion, removed } = build({ trees: { ...LOCAL_ONLY, ...over } });

    await expect(deletion.execute("tdd", "working-tdd")).resolves.toEqual({
      ok: false,
      error: "not-local-only",
    });
    expect(removed).toEqual([]);
  });

  // Fail-closed: a clone nobody could read is not proof of what the folder holds.
  it("refuses when the clone cannot be read", async () => {
    const { deletion, removed } = build({ trees: null });

    await expect(deletion.execute("tdd", "working-tdd")).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
    expect(removed).toEqual([]);
  });

  it("refuses a folder that changed after the check", async () => {
    const { deletion, removed } = build();

    await expect(deletion.execute("tdd", "earlier-tdd")).resolves.toEqual({
      ok: false,
      error: "confirmation-stale",
    });
    expect(removed).toEqual([]);
  });

  it("refuses a folder that resolves outside the Harness skills directory", async () => {
    const { deletion, removed } = build({
      realpath: async (path) => (path.endsWith("/tdd") ? "/elsewhere" : path),
    });

    await expect(deletion.execute("tdd", "working-tdd")).resolves.toEqual({
      ok: false,
      error: "destination-unsafe",
    });
    expect(removed).toEqual([]);
  });

  it("reports a removal the filesystem refused", async () => {
    const { deletion } = build({ removeFails: true });

    await expect(deletion.execute("tdd", "working-tdd")).resolves.toEqual({
      ok: false,
      error: "delete-failed",
    });
  });

  it("refuses while another Harness action holds the root's lock", async () => {
    const locks = new InFlightLocks();
    const { deletion } = build({ locks });

    const held = locks.run(ROOT, () => new Promise<void>(() => {}));
    void held;

    await expect(deletion.execute("tdd", "working-tdd")).resolves.toEqual({
      ok: false,
      error: "delete-in-progress",
    });
  });

  it("refuses a name that is not a skill slug", async () => {
    const { deletion, removed } = build();

    await expect(deletion.execute("../etc", "working-tdd")).resolves.toEqual({
      ok: false,
      error: "invalid-skill",
    });
    expect(removed).toEqual([]);
  });

  it("refuses with no Harness connected", async () => {
    const { deletion, removed } = build({ root: undefined });

    await expect(deletion.execute("tdd", "working-tdd")).resolves.toEqual({
      ok: false,
      error: "not-configured",
    });
    expect(removed).toEqual([]);
  });
});

describe("DeleteLocalSkill.inspect", () => {
  const TREES: HarnessSkillTrees = {
    remote: { jobs: "jobs-v1", gone: "gone-v1", edited: "edited-v1" },
    promote: {},
    local: { jobs: "jobs-v1", gone: "gone-v1", edited: "edited-v1" },
    working: { jobs: "jobs-v1", edited: "edited-v2", tdd: "working-tdd" },
  };

  it("reports, per skill, whether its folder is in the clone and what it holds", async () => {
    const { deletion } = build({ trees: TREES });

    await expect(deletion.inspect()).resolves.toEqual({
      ok: true,
      skills: {
        jobs: {
          inClone: true,
          workingTree: "jobs-v1",
          uncommitted: false,
          localOnly: false,
        },
        edited: {
          inClone: true,
          workingTree: "edited-v2",
          uncommitted: true,
          localOnly: false,
        },
        tdd: {
          inClone: true,
          workingTree: "working-tdd",
          uncommitted: true,
          localOnly: true,
        },
        gone: { inClone: false },
      },
    });
  });

  it("reports a skill only a proposal branch holds as not in the clone", async () => {
    const { deletion } = build({
      trees: { ...TREES, promote: { fresh: onBranch("branch-fresh") } },
    });

    const result = await deletion.inspect();

    expect(result.ok && result.skills.fresh).toEqual({ inClone: false });
  });

  it("answers no-answer when the clone cannot be read", async () => {
    const { deletion } = build({ trees: null });

    await expect(deletion.inspect()).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
  });

  it("answers not-configured with no Harness connected", async () => {
    const { deletion } = build({ root: undefined });

    await expect(deletion.inspect()).resolves.toEqual({
      ok: false,
      error: "not-configured",
    });
  });
});
