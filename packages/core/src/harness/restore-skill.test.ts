import { describe, expect, it } from "vitest";
import { InFlightLocks } from "../deploy/in-flight-locks";
import type { CopyEntryFacts } from "../filesystem/copy-tree-fs";
import type { HarnessReviewPort } from "./harness-review-port";
import type { HarnessGitPort, WorktreeAmbiguity } from "./read-harness-state";
import { RestoreSkill } from "./restore-skill";

const ROOT = "/harness";
const SKILLS = "/harness/.apm/skills";
const STAGING = "/harness/.apm/skills/.maestro-copy-1";
const HEAD = "commit-abc";

const FOLDER: CopyEntryFacts = {
  kind: "directory",
  size: 96,
  hardLinks: 2,
  executable: true,
  identity: "1:2:3",
};

type Calls = { git: string[]; review: string[] };

function build(overrides?: {
  root?: string | undefined;
  head?: string | null;
  staged?: boolean | null;
  atHead?: string[] | null;
  describes?: (CopyEntryFacts | null)[];
  write?: "written" | "missing" | "failed";
  realpath?: (path: string) => Promise<string>;
  moveFails?: boolean;
  locks?: InFlightLocks;
  ambiguity?: WorktreeAmbiguity | null;
}) {
  const calls: Calls = { git: [], review: [] };
  const moved: [string, string][] = [];
  const removed: string[] = [];
  const written: string[] = [];
  const describes = overrides?.describes ?? [null, null];
  let described = 0;
  const record =
    (kind: keyof Calls, name: string) => async (): Promise<never> => {
      calls[kind].push(name);
      throw new Error(`${name} must not be called`);
    };
  const git: HarnessGitPort = {
    fetch: record("git", "fetch"),
    readFacts: record("git", "readFacts"),
    readSkillTrees: async () => {
      const names =
        overrides && "atHead" in overrides
          ? (overrides.atHead ?? null)
          : ["tdd"];
      return names === null
        ? null
        : names.map((name) => ({ name, treeHash: `tree-${name}` }));
    },
    readSkillAuthors: record("git", "readSkillAuthors"),
    readMovementTrees: record("git", "readMovementTrees"),
    mergeBaseCommit: record("git", "mergeBaseCommit"),
    readSkillManifests: record("git", "readSkillManifests"),
    publishTag: record("git", "publishTag"),
    pushSkillPromotion: record("git", "pushSkillPromotion"),
    pushSkillDeletion: record("git", "pushSkillDeletion"),
    readWorktreeAmbiguity: async () => overrides?.ambiguity ?? null,
    readLocalHeadCommit: async () =>
      overrides && "head" in overrides ? (overrides.head ?? null) : HEAD,
    readStagedSkillDifference: async () =>
      overrides && "staged" in overrides ? (overrides.staged ?? null) : false,
    writeSkillTreeInto: async (_root, name, _commit, into) => {
      written.push(`${into}/${name}`);
      return overrides?.write ?? "written";
    },
  };
  const review: HarnessReviewPort = {
    readReviews: record("review", "readReviews"),
    createRequest: record("review", "createRequest"),
    reopenRequest: record("review", "reopenRequest"),
    closeRequest: record("review", "closeRequest"),
  };
  const restore = new RestoreSkill({
    resolveRoot: async () =>
      overrides && "root" in overrides ? overrides.root : ROOT,
    fs: { realpath: overrides?.realpath ?? (async (path) => path) },
    copyFs: {
      describe: async () => describes[described++] ?? null,
      createStagingDir: async () => STAGING,
      movePath: async (from, to) => {
        if (overrides?.moveFails === true) {
          throw new Error("ENOTEMPTY");
        }
        moved.push([from, to]);
      },
      removePath: async (path) => {
        removed.push(path);
      },
    },
    git,
    locks: overrides?.locks ?? new InFlightLocks(),
  });
  return { restore, calls, moved, removed, written, review };
}

describe("RestoreSkill", () => {
  it("writes the committed folder into place from the confirmed commit", async () => {
    const { restore, moved, written } = build();

    await expect(restore.execute("tdd", HEAD)).resolves.toEqual({
      ok: true,
      name: "tdd",
      commit: HEAD,
    });

    expect(written).toEqual([`${STAGING}/tdd`]);
    expect(moved).toEqual([[`${STAGING}/tdd`, `${SKILLS}/tdd`]]);
  });

  it("clears its staging directory whether the move worked or not", async () => {
    const done = build();
    await done.restore.execute("tdd", HEAD);
    expect(done.removed).toEqual([STAGING]);

    const failed = build({ moveFails: true });
    await expect(failed.restore.execute("tdd", HEAD)).resolves.toEqual({
      ok: false,
      error: "restore-failed",
    });
    expect(failed.removed).toEqual([STAGING]);
  });

  it("never fetches, pushes or asks GitHub anything", async () => {
    const { restore, calls } = build();
    await restore.execute("tdd", HEAD);
    expect(calls).toEqual({ git: [], review: [] });
  });

  it("refuses a name that is not a skill slug", async () => {
    const { restore, written } = build();
    await expect(restore.execute("../escape", HEAD)).resolves.toEqual({
      ok: false,
      error: "invalid-skill",
    });
    expect(written).toEqual([]);
  });

  it("refuses when no Harness is connected", async () => {
    const { restore } = build({ root: undefined });
    await expect(restore.execute("tdd", HEAD)).resolves.toEqual({
      ok: false,
      error: "not-configured",
    });
  });

  it("refuses when local HEAD moved after the confirmation read it", async () => {
    const { restore, written } = build({ head: "commit-xyz" });
    await expect(restore.execute("tdd", HEAD)).resolves.toEqual({
      ok: false,
      error: "head-moved",
    });
    expect(written).toEqual([]);
  });

  it("refuses when local HEAD cannot be read at all", async () => {
    const { restore } = build({ head: null });
    await expect(restore.execute("tdd", HEAD)).resolves.toEqual({
      ok: false,
      error: "restore-failed",
    });
  });

  it("refuses a skill with a staged edit or a staged deletion", async () => {
    const { restore, written } = build({ staged: true });
    await expect(restore.execute("tdd", HEAD)).resolves.toEqual({
      ok: false,
      error: "staged-changes",
    });
    expect(written).toEqual([]);
  });

  // Fail-closed: an unasked question is not a clean index.
  it("refuses when the staged question could not be asked", async () => {
    const { restore } = build({ staged: null });
    await expect(restore.execute("tdd", HEAD)).resolves.toEqual({
      ok: false,
      error: "staged-changes",
    });
  });

  it("refuses when the confirmed commit does not hold the skill", async () => {
    const { restore, written } = build({ atHead: ["jobs"] });
    await expect(restore.execute("tdd", HEAD)).resolves.toEqual({
      ok: false,
      error: "not-in-commit",
    });
    expect(written).toEqual([]);
  });

  it("refuses when the commit's skills could not be read", async () => {
    const { restore } = build({ atHead: null });
    await expect(restore.execute("tdd", HEAD)).resolves.toEqual({
      ok: false,
      error: "restore-failed",
    });
  });

  it("refuses when anything already sits at the destination", async () => {
    const { restore, written } = build({ describes: [FOLDER] });
    await expect(restore.execute("tdd", HEAD)).resolves.toEqual({
      ok: false,
      error: "destination-exists",
    });
    expect(written).toEqual([]);
  });

  // The window between the first look and the move: something else created the
  // folder while this restore was building its copy.
  it("refuses a destination that appeared while the copy was built", async () => {
    const { restore, moved, removed } = build({ describes: [null, FOLDER] });
    await expect(restore.execute("tdd", HEAD)).resolves.toEqual({
      ok: false,
      error: "destination-exists",
    });
    expect(moved).toEqual([]);
    expect(removed).toEqual([STAGING]);
  });

  it("refuses when the skills folder does not resolve inside the Harness", async () => {
    const { restore, written } = build({
      realpath: async (path) => (path === SKILLS ? "/elsewhere/skills" : path),
    });
    await expect(restore.execute("tdd", HEAD)).resolves.toEqual({
      ok: false,
      error: "destination-unsafe",
    });
    expect(written).toEqual([]);
  });

  it("refuses when the committed copy could not be written", async () => {
    const { restore, moved, removed } = build({ write: "failed" });
    await expect(restore.execute("tdd", HEAD)).resolves.toEqual({
      ok: false,
      error: "restore-failed",
    });
    // Nothing published and nothing half-written left behind.
    expect(moved).toEqual([]);
    expect(removed).toEqual([STAGING]);
  });

  // The commit's own trees said the skill is there, so git failing to resolve
  // it now is a read that broke — never proof the skill was never committed.
  it("refuses when the committed subtree could no longer be read", async () => {
    const { restore, moved, removed } = build({ write: "missing" });
    await expect(restore.execute("tdd", HEAD)).resolves.toEqual({
      ok: false,
      error: "source-unreadable",
    });
    expect(moved).toEqual([]);
    expect(removed).toEqual([STAGING]);
  });

  // Absent is one answer the destination can give; unreadable is no answer at
  // all, and an unread destination is never an empty one.
  it("refuses when the skills folder cannot be read at all", async () => {
    const { restore, written } = build({
      realpath: async (path) => {
        if (path === SKILLS) {
          throw new Error("ENOENT");
        }
        return path;
      },
    });
    await expect(restore.execute("tdd", HEAD)).resolves.toEqual({
      ok: false,
      error: "destination-unreadable",
    });
    expect(written).toEqual([]);
  });

  // Asked before anything else, so a working tree that cannot answer for the
  // author's intent refuses under its own name (`promote-deletion.ts`).
  describe("an ambiguous working tree", () => {
    const ambiguities: WorktreeAmbiguity[] = [
      "sparse-checkout",
      "merge-in-progress",
      "rebase-in-progress",
      "unresolved-conflicts",
      "unreadable",
    ];

    for (const ambiguity of ambiguities) {
      it(`refuses under ${ambiguity}, before any other fact is read`, async () => {
        const { restore, written, moved } = build({
          ambiguity,
          // Facts that would each refuse under their own code: none of them is
          // reached, so the answer proves the order.
          head: "commit-xyz",
          staged: true,
        });

        await expect(restore.execute("tdd", HEAD)).resolves.toEqual({
          ok: false,
          error: ambiguity,
        });
        expect(written).toEqual([]);
        expect(moved).toEqual([]);
      });
    }
  });

  it("refuses a second restore while one holds the Harness", async () => {
    const locks = new InFlightLocks();
    const { restore } = build({ locks });

    const held = locks.run(ROOT, async () => {
      await expect(restore.execute("tdd", HEAD)).resolves.toEqual({
        ok: false,
        error: "restore-in-progress",
      });
    });

    await expect(held).resolves.toMatchObject({ ok: true });
  });
});
