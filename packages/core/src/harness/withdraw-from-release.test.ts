import { describe, expect, it } from "vitest";
import { InFlightLocks } from "../deploy/in-flight-locks";
import {
  InMemoryHarnessGit,
  type Prompts,
  type Skills,
  skillRef,
} from "./harness-git.fake";
import type { PrimitiveRef } from "./harness-primitive";
import type {
  HarnessChange,
  HarnessStageRow,
  HarnessStages,
} from "./harness-stages";
import type { WithdrawalPushOutcome } from "./read-harness-state";
import { WithdrawFromRelease } from "./withdraw-from-release";

const ROOT = "/harness";
const RELEASE = "commit-release";
const MERGED = "commit-merged";
const FETCHED = { outcome: "fetched" as const, lastFetchedAt: "2026-10-25" };

const greet = { type: "prompt", name: "greet" } as const;

type Content = { skills?: Skills; prompts?: Prompts };

const releaseRow = (
  ref: PrimitiveRef,
  change: HarnessChange,
  over: Partial<HarnessStageRow> = {},
): HarnessStageRow => ({
  stage: "pending-release",
  type: ref.type,
  name: ref.name,
  path: ref.type === "skill" ? `.apm/skills/${ref.name}` : "",
  branch: `maestro/${ref.name}`,
  status: "not-yet-released",
  change,
  requests: [],
  reviewers: [],
  comparison: null,
  alsoIn: [],
  concurrentChange: false,
  waitingOn: null,
  localOnly: false,
  remoteTree: null,
  restorable: false,
  onDisk: true,
  ownsBranch: false,
  previousName: null,
  openRequests: [],
  mergedRequest: null,
  ...over,
});

const renameRow = releaseRow(skillRef("testing"), "rename", {
  previousName: "tdd",
});

const stagesWith = (rows: HarnessStageRow[]): HarnessStages => ({
  proposal: { outcome: "read", rows: [], bound: null },
  review: { outcome: "read", rows: [], bound: null },
  release: { outcome: "read", rows, bound: null },
});

// A Harness whose latest release, default branch and Working Harness each
// hold the content named.
function build(seed: {
  release: Content | null;
  merged: Content;
  working?: Content;
  rows: HarnessStageRow[];
  stages?: HarnessStages | null;
  locks?: InFlightLocks;
}) {
  const git = new InMemoryHarnessGit();
  if (seed.release !== null) {
    git.commit(RELEASE, seed.release.skills ?? {}, {
      prompts: seed.release.prompts ?? {},
    });
    git.tags = [{ name: "v0.1.0", commit: RELEASE }];
  }
  git.commit(MERGED, seed.merged.skills ?? {}, {
    prompts: seed.merged.prompts ?? {},
  });
  git.tip = MERGED;
  git.head = MERGED;
  const working = seed.working ?? seed.merged;
  git.working = { ...(working.skills ?? {}) };
  git.workingPrompts = { ...(working.prompts ?? {}) };

  let stages = seed.stages === undefined ? stagesWith(seed.rows) : seed.stages;
  const withdrawal = new WithdrawFromRelease({
    resolveRoot: async () => ROOT,
    readStages: async () => stages,
    freshness: { read: async () => FETCHED },
    git,
    locks: seed.locks ?? new InFlightLocks(),
  });

  // What the default branch holds now, against content stated by hand.
  let expected = 0;
  const defaultBranchHolds = async (content: Content) => {
    expected += 1;
    const id = git.commit(`expected-${expected}`, content.skills ?? {}, {
      prompts: content.prompts ?? {},
    });
    const at = async (ref: string | null) =>
      ref === null
        ? null
        : (await git.readPrimitives(ROOT, ref))?.sort((a, b) =>
            `${a.type}/${a.name}`.localeCompare(`${b.type}/${b.name}`),
          );
    expect(await at(git.tip)).toEqual(await at(id));
  };
  const workingHarness = () => ({
    skills: { ...git.working },
    prompts: { ...git.workingPrompts },
  });
  return {
    withdrawal,
    git,
    defaultBranchHolds,
    workingHarness,
    setStages: (next: HarnessStages | null) => {
      stages = next;
    },
  };
}

async function confirmed(
  withdrawal: WithdrawFromRelease,
  ref: PrimitiveRef,
): Promise<string> {
  const read = await withdrawal.inspect(ref);
  if (!read.ok) {
    throw new Error(`inspect refused: ${read.error}`);
  }
  return read.confirmation;
}

describe("WithdrawFromRelease", () => {
  describe("makes the default branch equal to the latest release for the item", () => {
    it("puts the released copy of a changed skill back, and nothing else moves", async () => {
      const { withdrawal, defaultBranchHolds } = build({
        release: { skills: { tdd: "released tdd", grill: "released grill" } },
        merged: { skills: { tdd: "merged tdd", grill: "teammate's grill" } },
        rows: [releaseRow(skillRef("tdd"), "edit")],
      });
      const token = await confirmed(withdrawal, skillRef("tdd"));

      await expect(withdrawal.execute(skillRef("tdd"), token)).resolves.toEqual(
        { ok: true, name: "tdd" },
      );
      await defaultBranchHolds({
        skills: { tdd: "released tdd", grill: "teammate's grill" },
      });
    });

    it("removes an added skill", async () => {
      const { withdrawal, defaultBranchHolds } = build({
        release: { skills: { tdd: "released tdd" } },
        merged: { skills: { tdd: "released tdd", review: "new review" } },
        rows: [releaseRow(skillRef("review"), "addition")],
      });
      const token = await confirmed(withdrawal, skillRef("review"));

      await expect(
        withdrawal.execute(skillRef("review"), token),
      ).resolves.toEqual({ ok: true, name: "review" });
      await defaultBranchHolds({ skills: { tdd: "released tdd" } });
    });

    it("brings a deleted skill back", async () => {
      const { withdrawal, defaultBranchHolds } = build({
        release: { skills: { tdd: "released tdd" } },
        merged: {},
        rows: [releaseRow(skillRef("tdd"), "deletion")],
      });
      const token = await confirmed(withdrawal, skillRef("tdd"));

      await withdrawal.execute(skillRef("tdd"), token);
      await defaultBranchHolds({ skills: { tdd: "released tdd" } });
    });

    it("removes an added skill from a Harness never released", async () => {
      const { withdrawal, defaultBranchHolds } = build({
        release: null,
        merged: { skills: { tdd: "first tdd" } },
        rows: [releaseRow(skillRef("tdd"), "addition")],
      });
      const token = await confirmed(withdrawal, skillRef("tdd"));

      await expect(withdrawal.execute(skillRef("tdd"), token)).resolves.toEqual(
        { ok: true, name: "tdd" },
      );
      await defaultBranchHolds({});
    });

    it.each([
      ["changed", "edit", { prompts: { greet: "merged", other: "kept" } }],
      ["deleted", "deletion", { prompts: { other: "kept" } }],
    ] as const)(
      "puts the released copy of a %s prompt back",
      async (_, change, merged) => {
        const { withdrawal, defaultBranchHolds } = build({
          release: { prompts: { greet: "released", other: "kept" } },
          merged,
          rows: [releaseRow(greet, change)],
        });
        const token = await confirmed(withdrawal, greet);

        await withdrawal.execute(greet, token);
        await defaultBranchHolds({
          prompts: { greet: "released", other: "kept" },
        });
      },
    );

    it("removes an added prompt", async () => {
      const { withdrawal, defaultBranchHolds } = build({
        release: { prompts: { other: "kept" } },
        merged: { prompts: { other: "kept", greet: "new" } },
        rows: [releaseRow(greet, "addition")],
      });
      const token = await confirmed(withdrawal, greet);

      await withdrawal.execute(greet, token);
      await defaultBranchHolds({ prompts: { other: "kept" } });
    });

    it("removes the new name of a rename, brings the old one back, and selects it", async () => {
      const { withdrawal, defaultBranchHolds } = build({
        release: { skills: { tdd: "released tdd" } },
        merged: { skills: { testing: "released tdd" } },
        rows: [renameRow],
      });
      const token = await confirmed(withdrawal, skillRef("testing"));

      await expect(
        withdrawal.execute(skillRef("testing"), token),
      ).resolves.toEqual({ ok: true, name: "tdd" });
      await defaultBranchHolds({ skills: { tdd: "released tdd" } });
    });
  });

  describe("the Working Harness", () => {
    it("stays as it was, unproposed edits included", async () => {
      const { withdrawal, workingHarness } = build({
        release: { skills: { tdd: "released tdd" } },
        merged: { skills: { tdd: "merged tdd", review: "new review" } },
        working: {
          skills: { tdd: "edited, never proposed", review: "new review" },
        },
        rows: [releaseRow(skillRef("tdd"), "edit")],
      });
      const before = workingHarness();
      const token = await confirmed(withdrawal, skillRef("tdd"));

      await withdrawal.execute(skillRef("tdd"), token);
      expect(workingHarness()).toEqual(before);
    });
  });

  describe("the commit message", () => {
    it.each([
      [skillRef("tdd"), "Withdraw skill: tdd"],
      [greet, "Withdraw prompt: greet"],
    ] as const)("names the %o", async (ref, subject) => {
      const { withdrawal, git } = build({
        release: null,
        merged: ref.type === "skill" ? { skills: { tdd: "x" } } : {},
        rows: [releaseRow(ref, "addition")],
      });
      const token = await confirmed(withdrawal, ref);

      await withdrawal.execute(ref, token);
      expect(git.withdrawals.map((pushed) => pushed.message)).toEqual([
        subject,
      ]);
    });

    it("names the merged pull request when one is known", async () => {
      const { withdrawal, git } = build({
        release: { skills: { tdd: "released tdd" } },
        merged: { skills: { tdd: "merged tdd" } },
        rows: [releaseRow(skillRef("tdd"), "edit", { mergedRequest: 47 })],
      });
      const token = await confirmed(withdrawal, skillRef("tdd"));

      await withdrawal.execute(skillRef("tdd"), token);
      expect(git.withdrawals[0]?.message).toBe(
        "Withdraw skill: tdd\n\nTakes pull request #47 out of the next release.",
      );
    });
  });

  describe("the confirmation read", () => {
    it("refuses an item that is not under Pending release", async () => {
      const { withdrawal } = build({
        release: { skills: { tdd: "released tdd" } },
        merged: { skills: { tdd: "released tdd" } },
        rows: [],
      });

      await expect(withdrawal.inspect(skillRef("tdd"))).resolves.toEqual({
        ok: false,
        error: "not-pending-release",
      });
    });

    it("gives no answer while the release stage is unknown", async () => {
      const { withdrawal } = build({
        release: { skills: { tdd: "released tdd" } },
        merged: { skills: { tdd: "merged tdd" } },
        rows: [],
        stages: { ...stagesWith([]), release: { outcome: "unknown" } },
      });

      await expect(withdrawal.inspect(skillRef("tdd"))).resolves.toEqual({
        ok: false,
        error: "no-answer",
      });
    });

    it("rejects a name that is not a skill slug", async () => {
      const { withdrawal } = build({ release: null, merged: {}, rows: [] });

      await expect(withdrawal.inspect(skillRef("../x"))).resolves.toEqual({
        ok: false,
        error: "invalid-skill",
      });
    });

    it("refuses to build a confirmation over an ambiguous working tree", async () => {
      const { withdrawal, git } = build({
        release: { skills: { tdd: "released tdd" } },
        merged: { skills: { tdd: "merged tdd" } },
        rows: [releaseRow(skillRef("tdd"), "edit")],
      });
      git.ambiguity = "merge-in-progress";

      await expect(withdrawal.inspect(skillRef("tdd"))).resolves.toEqual({
        ok: false,
        error: "merge-in-progress",
      });
    });
  });

  describe("a refusal changes nothing", () => {
    const changed = (over: { locks?: InFlightLocks } = {}) => {
      const built = build({
        release: { skills: { tdd: "released tdd" } },
        merged: { skills: { tdd: "merged tdd" } },
        working: { skills: { tdd: "edited, never proposed" } },
        rows: [releaseRow(skillRef("tdd"), "edit")],
        ...over,
      });
      const unchanged = async () => {
        expect(built.git.withdrawals).toEqual([]);
        expect(built.workingHarness()).toEqual({
          skills: { tdd: "edited, never proposed" },
          prompts: {},
        });
      };
      return { ...built, unchanged };
    };

    it("refuses as stale when the default branch moved after the confirmation", async () => {
      const { withdrawal, git, unchanged } = changed();
      const token = await confirmed(withdrawal, skillRef("tdd"));
      git.commit("commit-later", { tdd: "merged again" }, { parent: MERGED });
      git.tip = "commit-later";

      await expect(withdrawal.execute(skillRef("tdd"), token)).resolves.toEqual(
        { ok: false, error: "confirmation-stale" },
      );
      await unchanged();
    });

    it("refuses as stale when the remote's lease refuses the push", async () => {
      const { withdrawal, git, unchanged } = changed();
      const token = await confirmed(withdrawal, skillRef("tdd"));
      git.withdrawOutcome = "stale-tip";

      await expect(withdrawal.execute(skillRef("tdd"), token)).resolves.toEqual(
        { ok: false, error: "confirmation-stale" },
      );
      await unchanged();
    });

    it("refuses as stale when the latest release moved after the confirmation", async () => {
      const { withdrawal, git, unchanged } = changed();
      const token = await confirmed(withdrawal, skillRef("tdd"));
      git.commit("commit-newer", { tdd: "newer release" });
      git.tags = [
        { name: "v0.1.0", commit: RELEASE },
        { name: "v0.2.0", commit: "commit-newer" },
      ];

      await expect(withdrawal.execute(skillRef("tdd"), token)).resolves.toEqual(
        { ok: false, error: "confirmation-stale" },
      );
      await unchanged();
    });

    it.each([
      ["offline", "offline"],
      ["push-elsewhere", "push-elsewhere"],
      ["clone-not-current", "clone-not-current"],
      ["refused", "push-refused"],
      ["push-failed", "withdraw-failed"],
    ] as const satisfies readonly (readonly [WithdrawalPushOutcome, string])[])(
      "reads a push answered %s as %s",
      async (outcome, error) => {
        const { withdrawal, git, unchanged } = changed();
        const token = await confirmed(withdrawal, skillRef("tdd"));
        git.withdrawOutcome = outcome;

        await expect(
          withdrawal.execute(skillRef("tdd"), token),
        ).resolves.toEqual({ ok: false, error });
        await unchanged();
      },
    );

    it("refuses a clone whose HEAD is not the default-branch tip", async () => {
      const { withdrawal, git, unchanged } = changed();
      git.commit("commit-local", { tdd: "local commit" }, { parent: MERGED });
      git.head = "commit-local";
      const token = await confirmed(withdrawal, skillRef("tdd"));

      await expect(withdrawal.execute(skillRef("tdd"), token)).resolves.toEqual(
        { ok: false, error: "clone-not-current" },
      );
      await unchanged();
    });

    it("refuses a push that would land elsewhere than the fetch", async () => {
      const { withdrawal, git, unchanged } = changed();
      const token = await confirmed(withdrawal, skillRef("tdd"));
      git.pushesWhereItFetched = false;

      await expect(withdrawal.execute(skillRef("tdd"), token)).resolves.toEqual(
        { ok: false, error: "push-elsewhere" },
      );
      await unchanged();
    });

    it("refuses an item that left Pending release after the confirmation", async () => {
      const { withdrawal, setStages, unchanged } = changed();
      const token = await confirmed(withdrawal, skillRef("tdd"));
      setStages(stagesWith([]));

      await expect(withdrawal.execute(skillRef("tdd"), token)).resolves.toEqual(
        { ok: false, error: "not-pending-release" },
      );
      await unchanged();
    });

    it.each([
      ["has an open proposal", [52]],
      ["has an unknown pull request read", null],
    ] as const)("refuses while the item %s", async (_, openRequests) => {
      const { withdrawal, setStages, unchanged } = changed();
      const token = await confirmed(withdrawal, skillRef("tdd"));
      setStages(
        stagesWith([
          releaseRow(skillRef("tdd"), "edit", {
            openRequests: openRequests === null ? null : [...openRequests],
          }),
        ]),
      );

      await expect(withdrawal.execute(skillRef("tdd"), token)).resolves.toEqual(
        { ok: false, error: "proposal-open" },
      );
      await unchanged();
    });

    it("refuses an ambiguous working tree", async () => {
      const { withdrawal, git, unchanged } = changed();
      const token = await confirmed(withdrawal, skillRef("tdd"));
      git.ambiguity = "merge-in-progress";

      await expect(withdrawal.execute(skillRef("tdd"), token)).resolves.toEqual(
        { ok: false, error: "merge-in-progress" },
      );
      await unchanged();
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
      const { withdrawal, unchanged } = changed({ locks });
      const token = await confirmed(withdrawal, skillRef("tdd"));

      await expect(withdrawal.execute(skillRef("tdd"), token)).resolves.toEqual(
        { ok: false, error: "withdraw-in-progress" },
      );
      await unchanged();
      release();
      await holding;
    });
  });
});
