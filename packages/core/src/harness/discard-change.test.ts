import { describe, expect, it } from "vitest";
import { InFlightLocks } from "../deploy/in-flight-locks";
import { DiscardChange } from "./discard-change";
import { InMemoryHarnessGit, skillRef, treeHash } from "./harness-git.fake";
import type { HarnessStageRow, HarnessStages } from "./harness-stages";
import type { WorktreeAmbiguity } from "./read-harness-state";

const ROOT = "/harness";
const SKILLS = "/harness/.apm/skills";
const STAGING = "/harness/.apm/skills/.maestro-copy-1";
const REMOTE_COMMIT = "commit-remote";
const SEEN = treeHash("remote tdd");

const row = (over: Partial<HarnessStageRow> = {}): HarnessStageRow => ({
  stage: "pending-proposal",
  type: "skill",
  name: "tdd",
  path: ".apm/skills/tdd",
  branch: "maestro/tdd",
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
  onDisk: true,
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
  // The default branch's skills; null is a listing nobody could read.
  atRemote?: Record<string, string> | null;
  write?: "missing" | "failed";
  realpath?: (path: string) => Promise<string>;
  // A link: not a plain folder or file, so never followed.
  links?: string[];
  failMoveInto?: string;
  locks?: InFlightLocks;
}) {
  // An edited `tdd` on disk; the default branch holds "remote tdd".
  const git = new InMemoryHarnessGit().settled(
    { tdd: "remote tdd" },
    REMOTE_COMMIT,
  );
  git.working = { tdd: "edited tdd" };
  if (overrides && "atRemote" in overrides) {
    git.commit("newer", overrides.atRemote ?? {}, { parent: REMOTE_COMMIT });
    git.tip = "newer";
    if (overrides.atRemote === null) {
      git.unreadable.add("newer");
    }
  }
  if (overrides && "remoteCommit" in overrides) {
    git.tip = overrides.remoteCommit ?? null;
  }
  git.ambiguity = overrides?.ambiguity ?? null;
  git.writeOutcome = overrides?.write ?? null;
  const moved: [string, string][] = [];
  const removed: string[] = [];
  let failsLeft = overrides?.failMoveInto === undefined ? 0 : 1;
  const discard = new DiscardChange({
    resolveRoot: async () =>
      overrides && "root" in overrides ? overrides.root : ROOT,
    readStages: async () =>
      overrides && "stages" in overrides
        ? (overrides.stages ?? null)
        : stagesWith([row()]),
    fs: {
      realpath: overrides?.realpath ?? (async (path) => path),
      exists: async () => true,
      isDirectoryEntry: async (path) => !overrides?.links?.includes(path),
      isFileEntry: async (path) => !overrides?.links?.includes(path),
    },
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
    git,
    locks: overrides?.locks ?? new InFlightLocks(),
  });
  return { discard, moved, removed, written: git.written };
}

describe("DiscardChange", () => {
  it("swaps the folder for its default-branch copy and clears the staging folder", async () => {
    const { discard, moved, removed, written } = build();

    await expect(discard.execute(skillRef("tdd"), SEEN)).resolves.toEqual({
      ok: true,
      name: "tdd",
    });

    expect(written).toEqual([
      { type: "skill", name: "tdd", commit: REMOTE_COMMIT, into: STAGING },
    ]);
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

    await expect(discard.execute(skillRef("tdd"), SEEN)).resolves.toEqual({
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

    await expect(discard.execute(skillRef("tdd"), SEEN)).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
    expect(moved).toEqual([]);
  });

  it("refuses a change that is proposed by now", async () => {
    const { discard, moved } = build({
      stages: stagesWith([row({ status: "new-local-work" })]),
    });

    await expect(discard.execute(skillRef("tdd"), SEEN)).resolves.toEqual({
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

    await expect(discard.execute(skillRef("tdd"), SEEN)).resolves.toEqual({
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

    await expect(discard.execute(skillRef("tdd"), SEEN)).resolves.toEqual({
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
      { atRemote: { tdd: "newer tdd" } },
    ],
    ["the default branch no longer holds the skill", { atRemote: {} }],
  ])("refuses a stale confirmation when %s", async (_, overrides) => {
    const { discard, moved, written } = build(overrides);

    await expect(discard.execute(skillRef("tdd"), SEEN)).resolves.toEqual({
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

    await expect(discard.execute(skillRef("tdd"), SEEN)).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
    expect(moved).toEqual([]);
  });

  it("refuses an ambiguous working tree before reading anything else", async () => {
    const { discard, moved } = build({ ambiguity: "merge-in-progress" });

    await expect(discard.execute(skillRef("tdd"), SEEN)).resolves.toEqual({
      ok: false,
      error: "merge-in-progress",
    });
    expect(moved).toEqual([]);
  });

  it("refuses a skill folder that is a link", async () => {
    const { discard, moved } = build({
      realpath: async (path) =>
        path === `${SKILLS}/tdd` ? "/elsewhere/tdd" : path,
      links: [`${SKILLS}/tdd`],
    });

    await expect(discard.execute(skillRef("tdd"), SEEN)).resolves.toEqual({
      ok: false,
      error: "destination-unsafe",
    });
    expect(moved).toEqual([]);
  });

  // Real git lists no link as a prompt, so its row reads as a deletion.
  it("refuses a linked prompt the listing reads as deleted", async () => {
    const prompt = { type: "prompt", name: "pr-review" } as const;
    const file = "/harness/.maestro/prompts/pr-review.md";
    const { discard, moved } = build({
      stages: stagesWith([
        row({
          ...prompt,
          path: ".maestro/prompts/pr-review.md",
          change: "deletion",
        }),
      ]),
      links: [file],
    });

    await expect(discard.execute(prompt, SEEN)).resolves.toEqual({
      ok: false,
      error: "destination-unsafe",
    });
    expect(moved).toEqual([]);
  });

  it("fails without moving anything when the copy cannot be written", async () => {
    const { discard, moved, removed } = build({ write: "failed" });

    await expect(discard.execute(skillRef("tdd"), SEEN)).resolves.toEqual({
      ok: false,
      error: "discard-failed",
    });
    expect(moved).toEqual([]);
    expect(removed).toEqual([STAGING]);
  });

  it("rejects a name that is not a skill slug before resolving the Harness", async () => {
    const { discard } = build({ root: undefined });

    await expect(discard.execute(skillRef("../x"), SEEN)).resolves.toEqual({
      ok: false,
      error: "invalid-skill",
    });
  });

  it("answers not-configured without a Harness", async () => {
    const { discard } = build({ root: undefined });

    await expect(discard.execute(skillRef("tdd"), SEEN)).resolves.toEqual({
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

    await expect(discard.execute(skillRef("tdd"), SEEN)).resolves.toEqual({
      ok: false,
      error: "discard-in-progress",
    });
    release();
    await holding;
  });
});
