import { describe, expect, it } from "vitest";
import { InFlightLocks } from "../deploy/in-flight-locks";
import { PromoteSkill } from "./promote-skill";
import type {
  HarnessFacts,
  HarnessFreshness,
  PromoteSkillOutcome,
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

function buildPromote(overrides?: {
  root?: string | undefined;
  facts?: Partial<HarnessFacts>;
  freshness?: HarnessFreshness;
  fetchOutcome?: "fetched" | "offline" | "fetch-failed";
  fetchHold?: Promise<void>;
  outcome?: PromoteSkillOutcome;
  onPush?: (root: string, name: string, base: string) => void;
  onFreshnessRecord?: (root: string, freshness: HarnessFreshness) => void;
  trees?: Record<string, HarnessSkillTree[]>;
  mergeBase?: string | null;
  onMergeBaseCommit?: (remoteCommit: string) => void;
  // Facts per call, in order — a teammate's push landing between the two
  // in-promote checks, in the same shape a real re-fetch would surface.
  factsPerCall?: Partial<HarnessFacts>[];
  onFetch?: () => void;
}) {
  let factsCall = 0;
  return new PromoteSkill({
    resolveRoot: async () =>
      overrides && "root" in overrides ? overrides.root : "/harness",
    locks: new InFlightLocks(),
    git: {
      fetch: async () => {
        overrides?.onFetch?.();
        await overrides?.fetchHold;
        return overrides?.fetchOutcome ?? "fetched";
      },
      readFacts: async () => {
        const perCall = overrides?.factsPerCall;
        const facts =
          perCall === undefined
            ? overrides?.facts
            : (perCall[Math.min(factsCall, perCall.length - 1)] ??
              overrides?.facts);
        factsCall += 1;
        return { ...FACTS, ...facts };
      },
      readSkillTrees: async (_root: string, ref: string) =>
        overrides?.trees?.[ref] ?? [],
      mergeBaseCommit: async (_root: string, remoteCommit: string) => {
        overrides?.onMergeBaseCommit?.(remoteCommit);
        return overrides && "mergeBase" in overrides
          ? (overrides.mergeBase ?? null)
          : "base";
      },
      readSkillAuthors: async () => ({}),
      readMovementTrees: async () => ({
        remote: {},
        promote: {},
        local: {},
        working: {},
      }),
      readSkillManifests: async () => ({}),
      publishTag: async () => "pushed",
      pushSkillPromotion: async (root, name, base) => {
        overrides?.onPush?.(root, name, base);
        return overrides?.outcome ?? "pushed";
      },
      pushSkillDeletion: async () => {
        throw new Error("git port's pushSkillDeletion was reached");
      },
      readWorktreeAmbiguity: async () => null,
    },
    freshness: {
      read: async () => overrides?.freshness ?? FRESHNESS,
      record: async (root, freshness) => {
        overrides?.onFreshnessRecord?.(root, freshness);
      },
    },
  });
}

describe("PromoteSkill", () => {
  it("pushes the skill and answers with the branch and its pull-request page", async () => {
    const pushed: string[] = [];
    const promote = buildPromote({
      onPush: (root, name, base) => pushed.push(root, name, base),
    });

    await expect(promote.execute("tdd", AT)).resolves.toEqual({
      ok: true,
      branch: "maestro/tdd",
      pullRequestUrl:
        "https://github.com/fimoklei/agent-harness/compare/main...maestro/tdd?expand=1",
    });
    // The commit is built on the tip this call just fetched, never on local
    // HEAD: unrelated local commits must not ride into the pull request.
    expect(pushed).toEqual(["/harness", "tdd", "head"]);
  });

  it("refuses when no harness is connected", async () => {
    const promote = buildPromote({ root: undefined });

    await expect(promote.execute("tdd", AT)).resolves.toEqual({
      ok: false,
      error: "not-configured",
    });
  });

  it("refuses an origin apm could never resolve", async () => {
    const promote = buildPromote({ facts: { originUrl: "/srv/mirror.git" } });

    await expect(promote.execute("tdd", AT)).resolves.toEqual({
      ok: false,
      error: "no-usable-origin",
    });
  });

  it("refuses a name that is not a plain skill directory, without reaching git", async () => {
    let reached = false;
    const promote = buildPromote({ onPush: () => (reached = true) });

    await expect(promote.execute("../secrets", AT)).resolves.toEqual({
      ok: false,
      error: "invalid-skill",
    });
    expect(reached).toBe(false);
  });

  it("reports a fetch that got no answer as the unfresh state release uses", async () => {
    let reached = false;
    const promote = buildPromote({
      fetchOutcome: "offline",
      onPush: () => (reached = true),
    });

    await expect(promote.execute("tdd", AT)).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
    expect(reached).toBe(false);
  });

  it("records what the fetch found, so the screen shows this call's own reach", async () => {
    const recorded: HarnessFreshness[] = [];
    const promote = buildPromote({
      onFreshnessRecord: (_root, freshness) => recorded.push(freshness),
    });

    await promote.execute("tdd", AT);

    expect(recorded).toEqual([
      { outcome: "fetched", lastFetchedAt: AT.toISOString() },
    ]);
  });

  it("keeps the last successful time when this fetch failed", async () => {
    const recorded: HarnessFreshness[] = [];
    const promote = buildPromote({
      fetchOutcome: "fetch-failed",
      onFreshnessRecord: (_root, freshness) => recorded.push(freshness),
    });

    await promote.execute("tdd", AT);

    expect(recorded).toEqual([
      { outcome: "fetch-failed", lastFetchedAt: FRESHNESS.lastFetchedAt },
    ]);
  });

  it("refuses when the remote's default branch could not be read", async () => {
    const promote = buildPromote({
      facts: { defaultBranch: null, defaultBranchCommit: null },
    });

    await expect(promote.execute("tdd", AT)).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
  });

  it("reports a skill that is not in the working harness", async () => {
    const promote = buildPromote({ outcome: "skill-missing" });

    await expect(promote.execute("tdd", AT)).resolves.toEqual({
      ok: false,
      error: "skill-missing",
    });
  });

  it("reports a push that never reached the remote as no answer", async () => {
    const promote = buildPromote({ outcome: "offline" });

    await expect(promote.execute("tdd", AT)).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
  });

  it("refuses a clone whose push destination is not the origin the link names", async () => {
    const promote = buildPromote({ outcome: "push-elsewhere" });

    await expect(promote.execute("tdd", AT)).resolves.toEqual({
      ok: false,
      error: "push-elsewhere",
    });
  });

  it("leaves a refused push as a failure the author can press again", async () => {
    const promote = buildPromote({ outcome: "push-failed" });

    await expect(promote.execute("tdd", AT)).resolves.toEqual({
      ok: false,
      error: "promote-failed",
    });
  });

  it("refuses to push over a teammate's change that landed since the last refresh", async () => {
    let reached = false;
    const promote = buildPromote({
      onPush: () => (reached = true),
      trees: {
        head: [{ name: "tdd", treeHash: "theirs" }],
        HEAD: [{ name: "tdd", treeHash: "mine-old" }],
      },
    });

    await expect(promote.execute("tdd", AT)).resolves.toEqual({
      ok: false,
      error: "concurrent-change",
    });
    expect(reached).toBe(false);
  });

  it("still pushes the author's own unpushed commit, never mistaking it for a teammate's", async () => {
    const pushed: string[] = [];
    const promote = buildPromote({
      onPush: (root, name, base) => pushed.push(root, name, base),
      trees: {
        head: [{ name: "tdd", treeHash: "old" }],
        HEAD: [{ name: "tdd", treeHash: "mine" }],
        base: [{ name: "tdd", treeHash: "old" }],
      },
    });

    await expect(promote.execute("tdd", AT)).resolves.toMatchObject({
      ok: true,
    });
    expect(pushed).toEqual(["/harness", "tdd", "head"]);
  });

  it("never lets a teammate's change to a different skill block this promotion", async () => {
    // origin/HEAD diverged from local HEAD, but only `jobs` moved there since
    // the fork — `tdd`'s tree at the fork point still matches origin/HEAD's,
    // so this skill was never a teammate's doing (#579).
    const pushed: string[] = [];
    const promote = buildPromote({
      onPush: (root, name, base) => pushed.push(root, name, base),
      trees: {
        head: [
          { name: "tdd", treeHash: "same" },
          { name: "jobs", treeHash: "theirs" },
        ],
        HEAD: [
          { name: "tdd", treeHash: "mine" },
          { name: "jobs", treeHash: "old" },
        ],
        base: [
          { name: "tdd", treeHash: "same" },
          { name: "jobs", treeHash: "old" },
        ],
      },
    });

    await expect(promote.execute("tdd", AT)).resolves.toMatchObject({
      ok: true,
    });
    expect(pushed).toEqual(["/harness", "tdd", "head"]);
  });

  it("refetches and rechecks right before the push, catching a teammate's push landing in between", async () => {
    // The first check finds nothing concurrent, at "head-1". A teammate
    // pushes before this promotion's own pre-push refetch, moving the
    // default branch to "head-2" with a new tree for this skill — the
    // second check must catch it, and the push must never run (#579).
    let fetches = 0;
    const pushed: string[] = [];
    const promote = buildPromote({
      onFetch: () => {
        fetches += 1;
      },
      onPush: (root, name, base) => pushed.push(root, name, base),
      factsPerCall: [
        { defaultBranchCommit: "head-1" },
        { defaultBranchCommit: "head-2" },
      ],
      trees: {
        "head-1": [{ name: "tdd", treeHash: "same" }],
        "head-2": [{ name: "tdd", treeHash: "theirs" }],
        HEAD: [{ name: "tdd", treeHash: "same" }],
        base: [{ name: "tdd", treeHash: "same" }],
      },
    });

    await expect(promote.execute("tdd", AT)).resolves.toEqual({
      ok: false,
      error: "concurrent-change",
    });
    expect(fetches).toBe(2);
    expect(pushed).toEqual([]);
  });

  it("builds the push on the tip its own pre-push refetch found, not the first check's", async () => {
    const pushed: string[] = [];
    const promote = buildPromote({
      onPush: (root, name, base) => pushed.push(root, name, base),
      factsPerCall: [
        { defaultBranchCommit: "head-1" },
        { defaultBranchCommit: "head-2" },
      ],
      trees: {
        "head-1": [{ name: "tdd", treeHash: "same" }],
        "head-2": [{ name: "tdd", treeHash: "same" }],
        HEAD: [{ name: "tdd", treeHash: "same" }],
        base: [{ name: "tdd", treeHash: "same" }],
      },
    });

    await expect(promote.execute("tdd", AT)).resolves.toMatchObject({
      ok: true,
    });
    expect(pushed).toEqual(["/harness", "tdd", "head-2"]);
  });

  it("asks for the merge base against the exact commit each check just read, never a mutable ref", async () => {
    // Both checks pass a captured commit, one per read of the default
    // branch — never a shared ref that a concurrent fetch elsewhere could
    // have re-pointed in between (#579).
    const remoteCommits: string[] = [];
    const promote = buildPromote({
      onMergeBaseCommit: (remoteCommit) => remoteCommits.push(remoteCommit),
      factsPerCall: [
        { defaultBranchCommit: "head-1" },
        { defaultBranchCommit: "head-2" },
      ],
    });

    await promote.execute("tdd", AT);

    expect(remoteCommits).toEqual(["head-1", "head-2"]);
  });

  it("refuses a second promotion of the same harness while one is in flight", async () => {
    let release = () => {};
    const promote = buildPromote({
      fetchHold: new Promise<void>((resolve) => {
        release = resolve;
      }),
    });

    const first = promote.execute("tdd", AT);
    const second = await promote.execute("jobs", AT);
    release();

    expect(second).toEqual({ ok: false, error: "promote-in-progress" });
    await expect(first).resolves.toMatchObject({ ok: true });
  });
});
