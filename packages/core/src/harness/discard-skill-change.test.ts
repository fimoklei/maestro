import { describe, expect, it } from "vitest";
import { InFlightLocks } from "../deploy/in-flight-locks";
import { DiscardSkillChange } from "./discard-skill-change";
import type { HarnessStageRow, HarnessStages } from "./harness-stages";
import type { WorktreeAmbiguity } from "./read-harness-state";

const ROOT = "/harness";
const SKILLS = "/harness/.apm/skills";
const STAGING = "/harness/.apm/skills/.maestro-copy-1";
const REMOTE_COMMIT = "commit-remote";
const SEEN = "tree-remote";

const row = (over: Partial<HarnessStageRow> = {}): HarnessStageRow => ({
  stage: "pending-proposal",
  skill: "tdd",
  status: "not-yet-proposed",
  change: "edit",
  requests: [],
  reviewers: [],
  comparison: { kind: "default-branch" },
  alsoIn: [],
  concurrentChange: false,
  waitingOn: null,
  localOnly: false,
  remoteTree: SEEN,
  restorable: false,
  folderOnDisk: true,
  previousName: null,
  ...over,
});

const stagesWith = (rows: HarnessStageRow[]): HarnessStages => ({
  proposal: { outcome: "read", rows, bound: null },
  review: { outcome: "read", rows: [], bound: null },
  release: { outcome: "read", rows: [], bound: null },
});

function build(overrides?: {
  root?: string | undefined;
  stages?: HarnessStages | null;
  ambiguity?: WorktreeAmbiguity | null;
  remoteCommit?: string | null;
  atRemote?: { name: string; treeHash: string }[] | null;
  write?: "written" | "missing" | "failed";
  realpath?: (path: string) => Promise<string>;
  failMoveInto?: string;
  locks?: InFlightLocks;
}) {
  const moved: [string, string][] = [];
  const removed: string[] = [];
  const written: { commit: string; into: string }[] = [];
  let failsLeft = overrides?.failMoveInto === undefined ? 0 : 1;
  const discard = new DiscardSkillChange({
    resolveRoot: async () =>
      overrides && "root" in overrides ? overrides.root : ROOT,
    readStages: async () =>
      overrides && "stages" in overrides
        ? (overrides.stages ?? null)
        : stagesWith([row()]),
    fs: { realpath: overrides?.realpath ?? (async (path) => path) },
    copyFs: {
      createStagingDir: async () => STAGING,
      movePath: async (from, to) => {
        if (to === overrides?.failMoveInto && failsLeft-- > 0) {
          throw new Error("EACCES");
        }
        moved.push([from, to]);
      },
      removePath: async (path) => {
        removed.push(path);
      },
    },
    git: {
      readWorktreeAmbiguity: async () => overrides?.ambiguity ?? null,
      readFacts: async () => ({
        originUrl: "git@github.com:fimoklei/agent-harness.git",
        defaultBranch: "main",
        defaultBranchCommit:
          overrides && "remoteCommit" in overrides
            ? (overrides.remoteCommit ?? null)
            : REMOTE_COMMIT,
        tags: [],
      }),
      readSkillTrees: async () =>
        overrides && "atRemote" in overrides
          ? (overrides.atRemote ?? null)
          : [{ name: "tdd", treeHash: SEEN }],
      writeSkillTreeInto: async (_root, _name, commit, into) => {
        written.push({ commit, into });
        return overrides?.write ?? "written";
      },
    },
    locks: overrides?.locks ?? new InFlightLocks(),
  });
  return { discard, moved, removed, written };
}

describe("DiscardSkillChange", () => {
  it("swaps the folder for its default-branch copy and clears the staging folder", async () => {
    const { discard, moved, removed, written } = build();

    await expect(discard.execute("tdd", SEEN)).resolves.toEqual({
      ok: true,
      name: "tdd",
    });

    expect(written).toEqual([{ commit: REMOTE_COMMIT, into: STAGING }]);
    expect(moved).toEqual([
      [`${SKILLS}/tdd`, `${STAGING}/discarded`],
      [`${STAGING}/tdd`, `${SKILLS}/tdd`],
    ]);
    expect(removed).toEqual([STAGING]);
  });

  it("puts the edited folder back when the default-branch copy cannot move in", async () => {
    const { discard, moved, removed } = build({
      failMoveInto: `${SKILLS}/tdd`,
    });

    await expect(discard.execute("tdd", SEEN)).resolves.toEqual({
      ok: false,
      error: "discard-failed",
    });
    expect(moved).toEqual([
      [`${SKILLS}/tdd`, `${STAGING}/discarded`],
      [`${STAGING}/discarded`, `${SKILLS}/tdd`],
    ]);
    expect(removed).toEqual([STAGING]);
  });

  it.each([
    ["no proposal stage was read", null],
    [
      "the proposal stage is unknown",
      {
        ...stagesWith([]),
        proposal: { outcome: "unknown" },
      } satisfies HarnessStages,
    ],
  ])("answers no-answer when %s", async (_, stages) => {
    const { discard, moved } = build({ stages });

    await expect(discard.execute("tdd", SEEN)).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
    expect(moved).toEqual([]);
  });

  it("refuses a change that is proposed by now", async () => {
    const { discard, moved } = build({
      stages: stagesWith([row({ status: "new-local-work" })]),
    });

    await expect(discard.execute("tdd", SEEN)).resolves.toEqual({
      ok: false,
      error: "already-proposed",
    });
    expect(moved).toEqual([]);
  });

  // Propose change pushes the folder as it is, so the row moves to Pending
  // review and no Pending proposal row is left.
  it("refuses a change that moved to Pending review", async () => {
    const { discard, moved } = build({
      stages: {
        ...stagesWith([]),
        review: {
          outcome: "read",
          rows: [
            row({ stage: "pending-review", status: "waiting-for-review" }),
          ],
          bound: null,
        },
      },
    });

    await expect(discard.execute("tdd", SEEN)).resolves.toEqual({
      ok: false,
      error: "already-proposed",
    });
    expect(moved).toEqual([]);
  });

  it.each([
    ["no row waits for a proposal", stagesWith([])],
    [
      "the folder is deleted by now",
      stagesWith([row({ status: "not-yet-proposed", change: "deletion" })]),
    ],
  ])("has nothing to discard when %s", async (_, stages) => {
    const { discard, moved } = build({ stages });

    await expect(discard.execute("tdd", SEEN)).resolves.toEqual({
      ok: false,
      error: "nothing-to-discard",
    });
    expect(moved).toEqual([]);
  });

  it.each([
    [
      "the row was read against another tree",
      { stages: stagesWith([row({ remoteTree: "tree-newer" })]) },
    ],
    [
      "the default branch moved before the write",
      { atRemote: [{ name: "tdd", treeHash: "tree-newer" }] },
    ],
    ["the default branch no longer holds the skill", { atRemote: [] }],
  ])("refuses a stale confirmation when %s", async (_, overrides) => {
    const { discard, moved, written } = build(overrides);

    await expect(discard.execute("tdd", SEEN)).resolves.toEqual({
      ok: false,
      error: "confirmation-stale",
    });
    expect(moved).toEqual([]);
    expect(written).toEqual([]);
  });

  it.each([
    ["an unreadable default branch", { remoteCommit: null }],
    ["an unreadable skill listing", { atRemote: null }],
  ])("answers no-answer on %s", async (_, overrides) => {
    const { discard, moved } = build(overrides);

    await expect(discard.execute("tdd", SEEN)).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
    expect(moved).toEqual([]);
  });

  it("refuses an ambiguous working tree before reading anything else", async () => {
    const { discard, moved } = build({ ambiguity: "merge-in-progress" });

    await expect(discard.execute("tdd", SEEN)).resolves.toEqual({
      ok: false,
      error: "merge-in-progress",
    });
    expect(moved).toEqual([]);
  });

  it("refuses a skill folder that is a link", async () => {
    const { discard, moved } = build({
      realpath: async (path) =>
        path === `${SKILLS}/tdd` ? "/elsewhere/tdd" : path,
    });

    await expect(discard.execute("tdd", SEEN)).resolves.toEqual({
      ok: false,
      error: "destination-unsafe",
    });
    expect(moved).toEqual([]);
  });

  it("fails without moving anything when the copy cannot be written", async () => {
    const { discard, moved, removed } = build({ write: "failed" });

    await expect(discard.execute("tdd", SEEN)).resolves.toEqual({
      ok: false,
      error: "discard-failed",
    });
    expect(moved).toEqual([]);
    expect(removed).toEqual([STAGING]);
  });

  it("rejects a name that is not a skill slug before resolving the Harness", async () => {
    const { discard } = build({ root: undefined });

    await expect(discard.execute("../x", SEEN)).resolves.toEqual({
      ok: false,
      error: "invalid-skill",
    });
  });

  it("answers not-configured without a Harness", async () => {
    const { discard } = build({ root: undefined });

    await expect(discard.execute("tdd", SEEN)).resolves.toEqual({
      ok: false,
      error: "not-configured",
    });
  });

  it("refuses while another Harness write holds the lock", async () => {
    const locks = new InFlightLocks();
    let release = () => {};
    const holding = locks.run(
      ROOT,
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const { discard } = build({ locks });

    await expect(discard.execute("tdd", SEEN)).resolves.toEqual({
      ok: false,
      error: "discard-in-progress",
    });
    release();
    await holding;
  });
});
