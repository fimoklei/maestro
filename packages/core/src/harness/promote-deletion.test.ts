import { describe, expect, it } from "vitest";
import { InFlightLocks } from "../deploy/in-flight-locks";
import { PromoteSkillDeletion } from "./promote-deletion";
import type {
  HarnessFacts,
  HarnessFreshness,
  SkillPushOutcome,
  WorktreeAmbiguity,
} from "./read-harness-state";
import type { HarnessSkillTree } from "./skill-movements";

const AT = new Date("2026-08-09T12:00:00.000Z");

const FACTS: HarnessFacts = {
  originUrl: "git@github.com:fimoklei/agent-harness.git",
  defaultBranch: "main",
  defaultBranchCommit: "head",
  tags: [],
};

const FRESHNESS: HarnessFreshness = {
  outcome: "fetched",
  lastFetchedAt: "2026-08-01T07:00:00.000Z",
};

// The skill the author deleted: still at origin/HEAD and at local HEAD, gone
// from the working tree. `seen` is the origin/HEAD hash the row showed them.
const SEEN = "remote-tree";

const TREES: Record<string, HarnessSkillTree[]> = {
  head: [{ name: "tdd", treeHash: SEEN }],
  HEAD: [{ name: "tdd", treeHash: SEEN }],
};

function buildDeletion(overrides?: {
  root?: string | undefined;
  facts?: Partial<HarnessFacts>;
  freshness?: HarnessFreshness;
  fetchOutcome?: "fetched" | "offline" | "fetch-failed";
  outcome?: SkillPushOutcome;
  onPush?: (root: string, name: string, base: string) => void;
  ambiguity?: WorktreeAmbiguity | null;
  trees?: Record<string, HarnessSkillTree[]>;
  working?: Record<string, string>;
}) {
  return new PromoteSkillDeletion({
    resolveRoot: async () =>
      overrides && "root" in overrides ? overrides.root : "/harness",
    locks: new InFlightLocks(),
    git: {
      fetch: async () => overrides?.fetchOutcome ?? "fetched",
      readFacts: async () => ({ ...FACTS, ...overrides?.facts }),
      readSkillTrees: async (_root: string, ref: string) =>
        (overrides?.trees ?? TREES)[ref] ?? [],
      mergeBaseCommit: async () => "base",
      readSkillAuthors: async () => ({}),
      readMovementTrees: async () => ({
        remote: {},
        promote: {},
        local: {},
        working: overrides?.working ?? {},
      }),
      readSkillManifests: async () => ({}),
      readWorktreeAmbiguity: async () => overrides?.ambiguity ?? null,
      publishTag: async () => "pushed",
      pushSkillPromotion: async () => "pushed",
      pushSkillDeletion: async (root, name, base) => {
        overrides?.onPush?.(root, name, base);
        return overrides?.outcome ?? "pushed";
      },
    },
    freshness: {
      read: async () => overrides?.freshness ?? FRESHNESS,
      record: async () => {},
    },
  });
}

describe("PromoteSkillDeletion", () => {
  it("pushes the removal and answers with the branch and its pull-request page", async () => {
    const pushed: string[] = [];
    const deletion = buildDeletion({
      onPush: (root, name, base) => pushed.push(root, name, base),
    });

    await expect(deletion.execute("tdd", SEEN, AT)).resolves.toEqual({
      ok: true,
      branch: "maestro/tdd",
      pullRequestUrl:
        "https://github.com/fimoklei/agent-harness/compare/main...maestro/tdd?expand=1",
    });
    // The commit removes the subtree from the tip this call just fetched, never
    // from local HEAD: unrelated local commits must not ride into the removal.
    expect(pushed).toEqual(["/harness", "tdd", "head"]);
  });

  it("refuses a confirmation whose seen origin/HEAD tree has since moved", async () => {
    const pushed: string[] = [];
    const deletion = buildDeletion({
      trees: {
        // A teammate's change to this skill merged after the row was painted.
        head: [{ name: "tdd", treeHash: "theirs" }],
        HEAD: [{ name: "tdd", treeHash: SEEN }],
      },
      onPush: (root) => pushed.push(root),
    });

    await expect(deletion.execute("tdd", SEEN, AT)).resolves.toEqual({
      ok: false,
      error: "confirmation-stale",
    });
    expect(pushed).toEqual([]);
  });

  it("refuses a skill origin/HEAD no longer carries, so a removal is never pushed twice", async () => {
    const deletion = buildDeletion({
      trees: { head: [], HEAD: [{ name: "tdd", treeHash: SEEN }] },
    });

    await expect(deletion.execute("tdd", SEEN, AT)).resolves.toEqual({
      ok: false,
      error: "confirmation-stale",
    });
  });

  it("refuses a skill that is still on disk, which is an edit and not a removal", async () => {
    const pushed: string[] = [];
    const deletion = buildDeletion({
      working: { tdd: "on-disk" },
      onPush: (root) => pushed.push(root),
    });

    await expect(deletion.execute("tdd", SEEN, AT)).resolves.toEqual({
      ok: false,
      error: "not-deleted",
    });
    expect(pushed).toEqual([]);
  });

  it("refuses a skill local HEAD never tracked, so an untracked name is no deletion", async () => {
    const deletion = buildDeletion({
      trees: { head: [{ name: "tdd", treeHash: SEEN }], HEAD: [] },
    });

    await expect(deletion.execute("tdd", SEEN, AT)).resolves.toEqual({
      ok: false,
      error: "not-deleted",
    });
  });

  // Each ambiguity keeps its own name, so the copy can say which one it is
  // rather than one shrug covering four different working trees (#580).
  it.each([
    "sparse-checkout",
    "merge-in-progress",
    "rebase-in-progress",
    "unresolved-conflicts",
    "unreadable",
  ] as const)("refuses a removal while the working tree is %s", async (why) => {
    const pushed: string[] = [];
    const deletion = buildDeletion({
      ambiguity: why,
      onPush: (root) => pushed.push(root),
    });

    await expect(deletion.execute("tdd", SEEN, AT)).resolves.toEqual({
      ok: false,
      error: why,
    });
    expect(pushed).toEqual([]);
  });

  it("reports a harness that is not connected", async () => {
    await expect(
      buildDeletion({ root: undefined }).execute("tdd", SEEN, AT),
    ).resolves.toEqual({ ok: false, error: "not-configured" });
  });

  it("refuses a name that is not a skill before it reaches the harness", async () => {
    await expect(buildDeletion().execute("../etc", SEEN, AT)).resolves.toEqual({
      ok: false,
      error: "invalid-skill",
    });
  });

  it("refuses an origin no pull request can be opened against", async () => {
    await expect(
      buildDeletion({ facts: { originUrl: null } }).execute("tdd", SEEN, AT),
    ).resolves.toEqual({ ok: false, error: "no-usable-origin" });
  });

  it("refuses when the fetch got no answer, so nothing is removed from a stale tip", async () => {
    const pushed: string[] = [];
    const deletion = buildDeletion({
      fetchOutcome: "offline",
      onPush: (root) => pushed.push(root),
    });

    await expect(deletion.execute("tdd", SEEN, AT)).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
    expect(pushed).toEqual([]);
  });

  // The push's own classes, stated in this route's words. Every one leaves the
  // clone as it was, so a retry is another confirmation (#577).
  it.each([
    ["push-elsewhere", "push-elsewhere"],
    ["source-changed", "source-changed"],
    ["offline", "no-answer"],
    ["push-failed", "promote-failed"],
  ] as const)("answers a %s push as %s", async (outcome, error) => {
    await expect(
      buildDeletion({ outcome }).execute("tdd", SEEN, AT),
    ).resolves.toEqual({ ok: false, error });
  });
});
