import { describe, expect, it } from "vitest";
import { InFlightLocks } from "../deploy/in-flight-locks";
import { InMemoryCopyTree } from "../filesystem/copy-tree-fs.fake";
import {
  InMemoryHarnessGit,
  type Prompts,
  type Skills,
  skillRef,
} from "./harness-git.fake";
import { type PrimitiveRef, primitiveEntry } from "./harness-primitive";
import type {
  HarnessChange,
  HarnessStageRow,
  HarnessStages,
} from "./harness-stages";
import { WithdrawFromRelease } from "./withdraw-from-release";

const ROOT = "/harness";
const SKILLS = "/harness/.apm/skills";
const PROMPTS = "/harness/.maestro/prompts";
const RELEASE = "commit-release";
const MERGED = "commit-merged";
const FETCHED = { outcome: "fetched" as const, lastFetchedAt: "2026-10-25" };

const greet = { type: "prompt", name: "greet" } as const;

type Content = { skills?: Skills; prompts?: Prompts };

const releaseRow = (
  ref: PrimitiveRef,
  change: HarnessChange,
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
});

const stagesWith = (rows: HarnessStageRow[]): HarnessStages => ({
  proposal: { outcome: "read", rows: [], bound: null },
  review: { outcome: "read", rows: [], bound: null },
  release: { outcome: "read", rows, bound: null },
});

// A Harness whose latest release, default branch and disk each hold the
// content named; the disk is both the fake's working tree and real moves.
function build(seed: {
  release: Content | null;
  merged: Content;
  working: Content;
  rows: HarnessStageRow[];
  stages?: HarnessStages | null;
  failMoveInto?: string;
  locks?: InFlightLocks;
}) {
  const git = new InMemoryHarnessGit();
  const releaseContent = seed.release ?? {};
  if (seed.release !== null) {
    git.commit(RELEASE, releaseContent.skills ?? {}, {
      prompts: releaseContent.prompts ?? {},
    });
    git.tags = [{ name: "v0.1.0", commit: RELEASE }];
  }
  git.commit(MERGED, seed.merged.skills ?? {}, {
    prompts: seed.merged.prompts ?? {},
  });
  git.tip = MERGED;
  git.head = MERGED;

  const tree = new InMemoryCopyTree();
  tree.makeDir(SKILLS);
  tree.makeDir(PROMPTS);
  const setWorking = (content: Content) => {
    git.working = { ...(content.skills ?? {}) };
    git.workingPrompts = { ...(content.prompts ?? {}) };
    for (const [name, text] of Object.entries(content.skills ?? {})) {
      tree.write(`${SKILLS}/${name}/SKILL.md`, text ?? "");
    }
    for (const [name, text] of Object.entries(content.prompts ?? {})) {
      tree.write(`${PROMPTS}/${name}.md`, text);
    }
  };
  setWorking(seed.working);

  let failsLeft = seed.failMoveInto === undefined ? 0 : 1;
  const locks = seed.locks ?? new InFlightLocks();
  let stages = seed.stages === undefined ? stagesWith(seed.rows) : seed.stages;
  const setStages = (next: HarnessStages | null) => {
    stages = next;
  };
  const withdrawal = new WithdrawFromRelease({
    resolveRoot: async () => ROOT,
    readStages: async () => stages,
    freshness: { read: async () => FETCHED },
    fs: tree.fileSystem(),
    copyFs: {
      createStagingDir: (parent) => tree.createStagingDir(parent),
      removePath: (path) => tree.removePath(path),
      movePath: async (from, to) => {
        if (to === seed.failMoveInto && failsLeft-- > 0) {
          throw new Error("EACCES");
        }
        await tree.movePath(from, to);
      },
    },
    git: {
      readWorktreeAmbiguity: (root) => git.readWorktreeAmbiguity(root),
      readFacts: (root) => git.readFacts(root),
      readPrimitives: (root, ref) => git.readPrimitives(root, ref),
      readMovementTrees: (root) => git.readMovementTrees(root),
      readWorkingDifferences: (root, refs, commit) =>
        git.readWorkingDifferences(root, refs, commit),
      writePrimitiveInto: async (root, ref, commit, into) => {
        const written = await git.writePrimitiveInto(root, ref, commit, into);
        if (written === "written") {
          const text =
            ref.type === "skill"
              ? releaseContent.skills?.[ref.name]
              : releaseContent.prompts?.[ref.name];
          tree.write(
            ref.type === "skill"
              ? `${into}/${primitiveEntry(ref)}/SKILL.md`
              : `${into}/${primitiveEntry(ref)}`,
            text ?? "",
          );
        }
        return written;
      },
    },
    locks,
  });

  const fs = tree.fileSystem();
  const disk = async () => ({
    skills: (await tree.listNames(SKILLS))?.sort() ?? null,
    prompts: (await tree.listNames(PROMPTS))?.sort() ?? null,
  });
  const skillText = (name: string) => fs.readFile(`${SKILLS}/${name}/SKILL.md`);
  const promptText = (name: string) => fs.readFile(`${PROMPTS}/${name}.md`);
  return {
    withdrawal,
    git,
    tree,
    disk,
    skillText,
    promptText,
    setWorking,
    setStages,
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
  describe("makes the Working Harness equal to the latest release", () => {
    it("puts the released copy back over a changed skill", async () => {
      const { withdrawal, skillText } = build({
        release: { skills: { tdd: "released tdd" } },
        merged: { skills: { tdd: "merged tdd" } },
        working: { skills: { tdd: "merged tdd" } },
        rows: [releaseRow(skillRef("tdd"), "edit")],
      });
      const token = await confirmed(withdrawal, skillRef("tdd"));

      await expect(withdrawal.execute(skillRef("tdd"), token)).resolves.toEqual(
        { ok: true, name: "tdd" },
      );
      expect(await skillText("tdd")).toBe("released tdd");
    });

    it("removes an added skill", async () => {
      const { withdrawal, disk } = build({
        release: { skills: { tdd: "released tdd" } },
        merged: { skills: { tdd: "released tdd", review: "new review" } },
        working: { skills: { tdd: "released tdd", review: "new review" } },
        rows: [releaseRow(skillRef("review"), "addition")],
      });
      const token = await confirmed(withdrawal, skillRef("review"));

      await expect(
        withdrawal.execute(skillRef("review"), token),
      ).resolves.toEqual({ ok: true, name: "review" });
      expect((await disk()).skills).toEqual(["tdd"]);
    });

    it("brings a deleted skill back", async () => {
      const { withdrawal, skillText } = build({
        release: { skills: { tdd: "released tdd" } },
        merged: {},
        working: {},
        rows: [releaseRow(skillRef("tdd"), "deletion")],
      });
      const token = await confirmed(withdrawal, skillRef("tdd"));

      await expect(withdrawal.execute(skillRef("tdd"), token)).resolves.toEqual(
        { ok: true, name: "tdd" },
      );
      expect(await skillText("tdd")).toBe("released tdd");
    });

    it("removes an added skill from a Harness never released", async () => {
      const { withdrawal, disk } = build({
        release: null,
        merged: { skills: { tdd: "first tdd" } },
        working: { skills: { tdd: "first tdd" } },
        rows: [releaseRow(skillRef("tdd"), "addition")],
      });
      const token = await confirmed(withdrawal, skillRef("tdd"));

      await expect(withdrawal.execute(skillRef("tdd"), token)).resolves.toEqual(
        { ok: true, name: "tdd" },
      );
      expect((await disk()).skills).toEqual([]);
    });

    it.each([
      ["changed", "edit", { prompts: { greet: "merged" } }],
      ["deleted", "deletion", {}],
    ] as const)(
      "puts the released copy of a %s prompt in place",
      async (_, change, merged) => {
        const { withdrawal, promptText } = build({
          release: { prompts: { greet: "released" } },
          merged,
          working: merged,
          rows: [releaseRow(greet, change)],
        });
        const token = await confirmed(withdrawal, greet);

        await expect(withdrawal.execute(greet, token)).resolves.toEqual({
          ok: true,
          name: "greet",
        });
        expect(await promptText("greet")).toBe("released");
      },
    );

    it("removes an added prompt", async () => {
      const { withdrawal, disk } = build({
        release: { prompts: { other: "kept" } },
        merged: { prompts: { other: "kept", greet: "new" } },
        working: { prompts: { other: "kept", greet: "new" } },
        rows: [releaseRow(greet, "addition")],
      });
      const token = await confirmed(withdrawal, greet);

      await expect(withdrawal.execute(greet, token)).resolves.toEqual({
        ok: true,
        name: "greet",
      });
      expect((await disk()).prompts).toEqual(["other.md"]);
    });

    it("removes the new name of a rename and brings the old one back", async () => {
      const { withdrawal, disk, skillText } = build({
        release: { skills: { tdd: "released tdd" } },
        merged: { skills: { testing: "released tdd" } },
        working: { skills: { testing: "released tdd" } },
        rows: [
          { ...releaseRow(skillRef("testing"), "rename"), previousName: "tdd" },
        ],
      });
      const token = await confirmed(withdrawal, skillRef("testing"));

      await expect(
        withdrawal.execute(skillRef("testing"), token),
      ).resolves.toEqual({ ok: true, name: "tdd" });
      expect((await disk()).skills).toEqual(["tdd"]);
      expect(await skillText("tdd")).toBe("released tdd");
    });
  });

  describe("the confirmation read", () => {
    it("lists no files when the Working Harness equals the default branch", async () => {
      const { withdrawal } = build({
        release: { skills: { tdd: "released tdd" } },
        merged: { skills: { tdd: "merged tdd" } },
        working: { skills: { tdd: "merged tdd" } },
        rows: [releaseRow(skillRef("tdd"), "edit")],
      });

      await expect(withdrawal.inspect(skillRef("tdd"))).resolves.toMatchObject({
        ok: true,
        files: [],
      });
    });

    it("lists the files of unproposed work the withdrawal replaces", async () => {
      const { withdrawal } = build({
        release: { skills: { tdd: "released tdd" } },
        merged: { skills: { tdd: "merged tdd" } },
        working: { skills: { tdd: "edited, never proposed" } },
        rows: [releaseRow(skillRef("tdd"), "edit")],
      });

      await expect(withdrawal.inspect(skillRef("tdd"))).resolves.toMatchObject({
        ok: true,
        files: [".apm/skills/tdd/SKILL.md"],
      });
    });

    it("refuses an item that is not under Pending release", async () => {
      const { withdrawal } = build({
        release: { skills: { tdd: "released tdd" } },
        merged: { skills: { tdd: "released tdd" } },
        working: { skills: { tdd: "released tdd" } },
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
        working: { skills: { tdd: "merged tdd" } },
        rows: [],
        stages: { ...stagesWith([]), release: { outcome: "unknown" } },
      });

      await expect(withdrawal.inspect(skillRef("tdd"))).resolves.toEqual({
        ok: false,
        error: "no-answer",
      });
    });

    it("rejects a name that is not a skill slug", async () => {
      const { withdrawal } = build({
        release: null,
        merged: {},
        working: {},
        rows: [],
      });

      await expect(withdrawal.inspect(skillRef("../x"))).resolves.toEqual({
        ok: false,
        error: "invalid-skill",
      });
    });
  });

  describe("a refusal writes nothing", () => {
    const changed = (over: { locks?: InFlightLocks } = {}) =>
      build({
        release: { skills: { tdd: "released tdd" } },
        merged: { skills: { tdd: "merged tdd" } },
        working: { skills: { tdd: "merged tdd" } },
        rows: [releaseRow(skillRef("tdd"), "edit")],
        ...over,
      });

    it("refuses when the Working Harness changed after the confirmation", async () => {
      const { withdrawal, setWorking, skillText } = changed();
      const token = await confirmed(withdrawal, skillRef("tdd"));
      setWorking({ skills: { tdd: "edited since" } });

      await expect(withdrawal.execute(skillRef("tdd"), token)).resolves.toEqual(
        { ok: false, error: "confirmation-stale" },
      );
      expect(await skillText("tdd")).toBe("edited since");
    });

    it("refuses when the latest release moved after the confirmation", async () => {
      const { withdrawal, git, skillText } = changed();
      const token = await confirmed(withdrawal, skillRef("tdd"));
      git.commit("commit-newer", { tdd: "newer release" });
      git.tags = [
        { name: "v0.1.0", commit: RELEASE },
        { name: "v0.2.0", commit: "commit-newer" },
      ];

      await expect(withdrawal.execute(skillRef("tdd"), token)).resolves.toEqual(
        { ok: false, error: "confirmation-stale" },
      );
      expect(await skillText("tdd")).toBe("merged tdd");
    });

    it("refuses an item that left Pending release after the confirmation", async () => {
      const { withdrawal, setStages, skillText } = changed();
      const token = await confirmed(withdrawal, skillRef("tdd"));
      setStages(stagesWith([]));

      await expect(withdrawal.execute(skillRef("tdd"), token)).resolves.toEqual(
        { ok: false, error: "not-pending-release" },
      );
      expect(await skillText("tdd")).toBe("merged tdd");
    });

    it("refuses an ambiguous working tree", async () => {
      const { withdrawal, git, skillText } = changed();
      const token = await confirmed(withdrawal, skillRef("tdd"));
      git.ambiguity = "merge-in-progress";

      await expect(withdrawal.execute(skillRef("tdd"), token)).resolves.toEqual(
        { ok: false, error: "merge-in-progress" },
      );
      expect(await skillText("tdd")).toBe("merged tdd");
    });

    it("refuses a skill folder that is a link", async () => {
      const { withdrawal, tree } = changed();
      const token = await confirmed(withdrawal, skillRef("tdd"));
      tree.remove(`${SKILLS}/tdd`);
      tree.write("/elsewhere/tdd/SKILL.md", "outside");
      tree.symlink(`${SKILLS}/tdd`, "/elsewhere/tdd");

      await expect(withdrawal.execute(skillRef("tdd"), token)).resolves.toEqual(
        { ok: false, error: "destination-unsafe" },
      );
      expect(tree.read("/elsewhere/tdd/SKILL.md")?.toString()).toBe("outside");
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
      const { withdrawal, skillText } = changed({ locks });
      const token = await confirmed(withdrawal, skillRef("tdd"));

      await expect(withdrawal.execute(skillRef("tdd"), token)).resolves.toEqual(
        { ok: false, error: "withdraw-in-progress" },
      );
      expect(await skillText("tdd")).toBe("merged tdd");
      release();
      await holding;
    });
  });

  describe("a failed write", () => {
    it("leaves a changed skill as it was", async () => {
      const { withdrawal, skillText } = build({
        release: { skills: { tdd: "released tdd" } },
        merged: { skills: { tdd: "merged tdd" } },
        working: { skills: { tdd: "merged tdd" } },
        rows: [releaseRow(skillRef("tdd"), "edit")],
        failMoveInto: `${SKILLS}/tdd`,
      });
      const token = await confirmed(withdrawal, skillRef("tdd"));

      await expect(withdrawal.execute(skillRef("tdd"), token)).resolves.toEqual(
        { ok: false, error: "withdraw-failed" },
      );
      expect(await skillText("tdd")).toBe("merged tdd");
    });

    it("leaves both names of a rename as they were", async () => {
      const { withdrawal, disk, skillText } = build({
        release: { skills: { tdd: "released tdd" } },
        merged: { skills: { testing: "released tdd" } },
        working: { skills: { testing: "released tdd" } },
        rows: [
          { ...releaseRow(skillRef("testing"), "rename"), previousName: "tdd" },
        ],
        failMoveInto: `${SKILLS}/tdd`,
      });
      const token = await confirmed(withdrawal, skillRef("testing"));

      await expect(
        withdrawal.execute(skillRef("testing"), token),
      ).resolves.toEqual({ ok: false, error: "withdraw-failed" });
      expect((await disk()).skills).toEqual(["testing"]);
      expect(await skillText("testing")).toBe("released tdd");
    });
  });
});
