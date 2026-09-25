import { describe, expect, it } from "vitest";
import { InFlightLocks } from "../deploy/in-flight-locks";
import type {
  HarnessReviewRead,
  NewReviewRequest,
  ReviewRequest,
} from "./harness-review-port";
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

// `seen` is the origin/HEAD hash the row showed the author.
const SEEN = "remote-tree";

const EMPTY_REVIEW: HarnessReviewRead = {
  outcome: "read",
  requests: [],
  complete: true,
  limit: 100,
};

const openRequest = (over: Partial<ReviewRequest> = {}): ReviewRequest => ({
  number: 45,
  url: "https://github.com/fimoklei/agent-harness/pull/45",
  state: "open",
  draft: false,
  decision: null,
  reviewers: [],
  headOwner: "fimoklei",
  headRepo: "agent-harness",
  headBranch: "maestro/tdd",
  headCommit: "3d0f1a9c5b7e2846f0a1c3d5e7b9081726354adf",
  baseBranch: "main",
  ...over,
});

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
  review?: HarnessReviewRead;
  onCreate?: (request: NewReviewRequest) => void;
}) {
  return new PromoteSkillDeletion({
    resolveRoot: async () =>
      overrides && "root" in overrides ? overrides.root : "/harness",
    locks: new InFlightLocks(),
    git: {
      fetch: async () => overrides?.fetchOutcome ?? "fetched",
      catchUp: async () => {},
      readCloneSync: async () => "current" as const,
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
      readLocalHeadCommit: async () => "local-head",
      readStagedSkillDifference: async () => false,
      writeSkillTreeInto: async () => "written",
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
    review: {
      readReviews: async () => overrides?.review ?? EMPTY_REVIEW,
      createRequest: async (_origin, made) => {
        overrides?.onCreate?.(made);
        return { ok: true };
      },
      reopenRequest: async () => ({ ok: true }),
      closeRequest: async () => ({ ok: true }),
    },
  });
}

describe("PromoteSkillDeletion", () => {
  it("opens the pull request the pushed removal has no proposal for", async () => {
    const created: NewReviewRequest[] = [];
    const deletion = buildDeletion({ onCreate: (made) => created.push(made) });

    await expect(deletion.execute("tdd", SEEN, AT)).resolves.toMatchObject({
      ok: true,
    });
    expect(created).toEqual([
      {
        head: "maestro/tdd",
        base: "main",
        title: "Promote skill: tdd",
        body: "Proposed from the Maestro cockpit.",
      },
    ]);
  });

  it("leaves an open proposal's request alone when the removal updates it", async () => {
    const created: NewReviewRequest[] = [];
    const deletion = buildDeletion({
      review: { ...EMPTY_REVIEW, requests: [openRequest()] },
      onCreate: (made) => created.push(made),
    });

    await expect(deletion.execute("tdd", SEEN, AT)).resolves.toMatchObject({
      ok: true,
    });
    expect(created).toEqual([]);
  });

  it("refuses while more than one open request matches the branch", async () => {
    const pushed: string[] = [];
    const deletion = buildDeletion({
      review: {
        ...EMPTY_REVIEW,
        requests: [openRequest({ number: 41 }), openRequest({ number: 44 })],
      },
      onPush: (root) => pushed.push(root),
    });

    await expect(deletion.execute("tdd", SEEN, AT)).resolves.toEqual({
      ok: false,
      error: "extra-requests",
    });
    expect(pushed).toEqual([]);
  });

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
    // Built on the fetched tip, never local HEAD: local commits must not ride along.
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

  // Each ambiguity keeps its own name so the copy can say which one (#580).
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

  // Every push failure leaves the clone as it was, so a retry is safe (#577).
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
