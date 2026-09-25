import { describe, expect, it, vi } from "vitest";
import type {
  HarnessReviewPort,
  HarnessReviewRead,
} from "./harness-review-port";
import type {
  CloneSync,
  HarnessFacts,
  HarnessFetchOutcome,
  HarnessFreshness,
  HarnessSkillTrees,
} from "./read-harness-state";
import { ReadHarnessState } from "./read-harness-state";
import type { HarnessSkillTree } from "./skill-movements";

const FETCHED: HarnessFreshness = {
  outcome: "fetched",
  lastFetchedAt: "2026-08-01T07:00:00.000Z",
};

const FACTS: HarnessFacts = {
  originUrl: "git@github.com:fimoklei/agent-harness.git",
  defaultBranch: "main",
  defaultBranchCommit: "aaa",
  tags: [
    { name: "v0.4.0", commit: "old" },
    { name: "v0.5.0", commit: "aaa" },
  ],
};

function stubFreshness(
  initial: HarnessFreshness = {
    outcome: null,
    lastFetchedAt: null,
  },
) {
  let current = initial;
  return {
    read: async (_root: string) => current,
    record: async (_root: string, freshness: HarnessFreshness) => {
      current = freshness;
    },
  };
}

// Unlisted: a ref with no skills. Null: a ref the adapter could not read.
type TreesByRef = Record<string, HarnessSkillTree[] | null>;

// A null tree is a branch proposing to delete its skill.
const onBranch = (tree: string | null) => ({ tree, commit: "branch-tip" });

const SETTLED_TREES: HarnessSkillTrees = {
  remote: { tdd: "same" },
  promote: {},
  local: { tdd: "same" },
  working: { tdd: "same" },
};

function buildRead(overrides?: {
  facts?: Partial<HarnessFacts>;
  root?: string | undefined;
  resolveRoot?: () => Promise<string | undefined>;
  fetch?: () => Promise<HarnessFetchOutcome>;
  freshness?: ReturnType<typeof stubFreshness>;
  trees?: TreesByRef;
  authors?: Record<string, string>;
  authorsAtRelease?: Record<string, string>;
  movementTrees?: Partial<HarnessSkillTrees> | null;
  // `null` is an unreadable merge base.
  mergeBase?: string | null;
  // Defaults to a complete read that found no request.
  review?: HarnessReviewRead;
  readReviews?: HarnessReviewPort["readReviews"];
  catchUp?: () => Promise<void>;
  readCloneSync?: () => Promise<CloneSync>;
}) {
  const head =
    overrides?.facts?.defaultBranchCommit ?? FACTS.defaultBranchCommit;
  return new ReadHarnessState({
    resolveRoot:
      overrides?.resolveRoot ??
      (async () =>
        overrides && "root" in overrides ? overrides.root : "/harness"),
    git: {
      fetch: overrides?.fetch ?? (async () => "fetched"),
      readFacts: async () => ({ ...FACTS, ...overrides?.facts }),
      catchUp: overrides?.catchUp ?? (async () => {}),
      readCloneSync: overrides?.readCloneSync ?? (async () => "current"),
      readSkillTrees: async (_root: string, ref: string) =>
        overrides?.trees?.[ref] === undefined ? [] : overrides.trees[ref],
      readSkillAuthors: async (_root: string, ref: string, names: string[]) => {
        const known =
          ref === head ? overrides?.authors : overrides?.authorsAtRelease;
        return Object.fromEntries(
          names.map((name) => [name, known?.[name] ?? null]),
        );
      },
      readMovementTrees: async () =>
        overrides?.movementTrees === null
          ? null
          : { ...SETTLED_TREES, ...overrides?.movementTrees },
      mergeBaseCommit: async () =>
        overrides && "mergeBase" in overrides
          ? (overrides.mergeBase ?? null)
          : "base",
      readSkillManifests: async (
        _root: string,
        _ref: string,
        names: string[],
      ) => Object.fromEntries(names.map((name) => [name, null])),
      publishTag: async () => {
        throw new Error("git port's publishTag was reached");
      },
      pushSkillPromotion: async () => {
        throw new Error("git port's pushSkillPromotion was reached");
      },
      pushSkillDeletion: async () => {
        throw new Error("git port's pushSkillDeletion was reached");
      },
      readWorktreeAmbiguity: async () => null,
      readLocalHeadCommit: async () => "local-head",
      readStagedSkillDifference: async () => false,
      writeSkillTreeInto: async () => "written",
    },
    freshness: overrides?.freshness ?? stubFreshness(FETCHED),
    review: {
      readReviews:
        overrides?.readReviews ??
        (async () =>
          overrides?.review ?? {
            outcome: "read",
            requests: [],
            complete: true,
            limit: 100,
          }),
    },
  });
}

describe("ReadHarnessState", () => {
  it("reads the released harness when the highest tag is the default branch tip", async () => {
    const read = buildRead();

    await expect(read.execute()).resolves.toEqual({
      ok: true,
      state: {
        origin: "github.com/fimoklei/agent-harness",
        releasedVersion: "v0.5.0",
        defaultBranch: "main",
        releaseState: "released",
        freshness: FETCHED,
        cloneSync: "current",
        localHeadCommit: "local-head",
        stages: {
          proposal: { outcome: "read", rows: [], bound: null },
          review: { outcome: "read", rows: [], bound: null },
          release: { outcome: "read", rows: [], bound: null },
        },
      },
    });
  });

  it("lists what merged since the release as green Pending release rows", async () => {
    const read = buildRead({
      facts: { defaultBranchCommit: "bbb" },
      trees: {
        aaa: [
          { name: "tdd", treeHash: "t1" },
          { name: "grilling", treeHash: "g1" },
        ],
        bbb: [
          { name: "tdd", treeHash: "t2" },
          { name: "research", treeHash: "r1" },
        ],
      },
      authors: { tdd: "Ada", research: "Grace", grilling: "Linus" },
    });

    const result = await read.execute();

    expect(result).toMatchObject({
      ok: true,
      state: {
        stages: {
          release: {
            outcome: "read",
            rows: [
              { skill: "grilling", status: "deleted", deletion: true },
              { skill: "research", status: "added" },
              { skill: "tdd", status: "changed" },
            ],
          },
        },
      },
    });
  });

  it("calls the comparison unknown when a ref's skills could not be read", async () => {
    // An unreadable ref is not an empty harness: every skill would read as removed.
    const read = buildRead({
      facts: { defaultBranchCommit: "bbb" },
      trees: { aaa: [{ name: "tdd", treeHash: "t1" }], bbb: null },
    });

    await expect(read.execute()).resolves.toMatchObject({
      ok: true,
      state: {
        releaseState: "unknown",
        stages: { release: { outcome: "unknown" } },
      },
    });
  });

  it("reads a never-released harness without calling it a failure", async () => {
    const read = buildRead({ facts: { tags: [] } });

    const result = await read.execute();

    expect(result).toMatchObject({
      ok: true,
      state: { releasedVersion: null, releaseState: "never-released" },
    });
  });

  it("reads merged work the released harness does not carry as pending release", async () => {
    const read = buildRead({
      facts: { defaultBranchCommit: "bbb" },
      trees: {
        aaa: [{ name: "tdd", treeHash: "t1" }],
        bbb: [{ name: "tdd", treeHash: "t2" }],
      },
    });

    const result = await read.execute();

    expect(result).toMatchObject({
      ok: true,
      state: { releasedVersion: "v0.5.0", releaseState: "pending-release" },
    });
  });

  it("reads a default branch that moved without touching a skill as released", async () => {
    // A commit after the tag can move the branch and change no skill (#845).
    const read = buildRead({
      facts: { defaultBranchCommit: "bbb" },
      trees: {
        aaa: [{ name: "tdd", treeHash: "t1" }],
        bbb: [{ name: "tdd", treeHash: "t1" }],
      },
    });

    await expect(read.execute()).resolves.toMatchObject({
      ok: true,
      state: {
        releasedVersion: "v0.5.0",
        releaseState: "released",
        stages: { release: { outcome: "read", rows: [] } },
      },
    });
  });

  it("does not claim work is waiting while the default branch is unknown", async () => {
    const read = buildRead({
      facts: { defaultBranch: null, defaultBranchCommit: null },
    });

    const result = await read.execute();

    expect(result).toMatchObject({
      ok: true,
      state: {
        releasedVersion: "v0.5.0",
        releaseState: "unknown",
        stages: { release: { outcome: "unknown" } },
      },
    });
  });

  it("never calls a harness unreleased on tags no fetch has confirmed", async () => {
    // Before the first fetch an empty tag list means "not looked yet" (#516).
    const read = buildRead({
      facts: { tags: [] },
      freshness: stubFreshness(),
    });

    await expect(read.execute()).resolves.toMatchObject({
      ok: true,
      state: { releasedVersion: null, releaseState: "unknown" },
    });
  });

  it("never calls a harness unreleased on tags it could not read", async () => {
    const read = buildRead({ facts: { tags: null } });

    await expect(read.execute()).resolves.toMatchObject({
      ok: true,
      state: { releasedVersion: null, releaseState: "unknown" },
    });
  });

  it("refuses when no harness is connected", async () => {
    const read = buildRead({ root: undefined });

    await expect(read.execute()).resolves.toEqual({
      ok: false,
      error: "not-configured",
    });
  });

  it("refuses an origin apm could never resolve, rather than showing a guess", async () => {
    const read = buildRead({
      facts: { originUrl: "/srv/mirrors/harness.git" },
    });

    await expect(read.execute()).resolves.toEqual({
      ok: false,
      error: "no-usable-origin",
    });
  });
});

describe("ReadHarnessState stages", () => {
  it("gives each skill a row in every stage it belongs to, in name order", async () => {
    const read = buildRead({
      movementTrees: {
        remote: { docs: "same", tdd: "same" },
        promote: { tdd: onBranch("pushed") },
        local: { docs: "same", tdd: "same" },
        working: { docs: "edited", tdd: "same" },
      },
    });

    await expect(read.execute()).resolves.toMatchObject({
      ok: true,
      state: {
        stages: {
          proposal: {
            rows: [
              { skill: "docs", status: "not-yet-proposed" },
              { skill: "tdd", status: "new-local-work" },
            ],
          },
          review: { rows: [{ skill: "tdd", status: "pull-request-missing" }] },
        },
      },
    });
  });

  it("finds a skill that exists only on a promote branch", async () => {
    // A new skill pushed for review is in none of the other three refs.
    const read = buildRead({
      movementTrees: {
        remote: {},
        promote: { fresh: onBranch("pushed") },
        local: {},
        working: {},
      },
    });

    await expect(read.execute()).resolves.toMatchObject({
      ok: true,
      state: {
        stages: {
          review: {
            rows: [{ skill: "fresh", status: "pull-request-missing" }],
          },
        },
      },
    });
  });

  it("surfaces a promote branch that proposes deleting its skill", async () => {
    const read = buildRead({
      movementTrees: {
        remote: { tdd: "same" },
        promote: { tdd: onBranch(null) },
        local: { tdd: "same" },
        working: { tdd: "same" },
      },
    });

    await expect(read.execute()).resolves.toMatchObject({
      ok: true,
      state: {
        stages: {
          review: {
            rows: [
              { skill: "tdd", status: "pull-request-missing", deletion: true },
            ],
          },
        },
      },
    });
  });

  it("marks a skill deleted from disk as a local deletion", async () => {
    const read = buildRead({
      movementTrees: {
        remote: { tdd: "same" },
        promote: {},
        local: { tdd: "same" },
        working: {},
      },
    });

    await expect(read.execute()).resolves.toMatchObject({
      ok: true,
      state: {
        stages: {
          proposal: {
            rows: [{ skill: "tdd", status: "deleted-locally", deletion: true }],
          },
        },
      },
    });
  });

  it("reads a renamed directory as one deletion and one addition", async () => {
    // Renames are not inferred (#575).
    const read = buildRead({
      movementTrees: {
        remote: { "old-name": "same" },
        promote: {},
        local: { "old-name": "same" },
        working: { "new-name": "same" },
      },
    });

    await expect(read.execute()).resolves.toMatchObject({
      ok: true,
      state: {
        stages: {
          proposal: {
            rows: [
              {
                skill: "new-name",
                status: "not-yet-proposed",
                deletion: false,
              },
              { skill: "old-name", status: "deleted-locally", deletion: true },
            ],
          },
        },
      },
    });
  });

  it("leaves a clone that is only behind with nothing of its own waiting", async () => {
    const read = buildRead({
      movementTrees: {
        remote: { tdd: "newer" },
        promote: {},
        local: { tdd: "older" },
        working: { tdd: "older" },
      },
    });

    await expect(read.execute()).resolves.toMatchObject({
      ok: true,
      state: { stages: { proposal: { rows: [] }, review: { rows: [] } } },
    });
  });

  it("calls the local stages unknown when a local ref could not be read", async () => {
    // An empty table would claim nothing is waiting, which this read cannot back.
    const read = buildRead({ movementTrees: null });

    await expect(read.execute()).resolves.toMatchObject({
      ok: true,
      state: {
        releaseState: "unknown",
        stages: {
          proposal: { outcome: "unknown" },
          review: { outcome: "unknown" },
        },
      },
    });
  });

  it("flags a local edit whose remote content already moved on as a concurrent change", async () => {
    // A teammate pushed the same skill to origin/HEAD (#579).
    const read = buildRead({
      movementTrees: {
        remote: { tdd: "theirs" },
        promote: {},
        local: { tdd: "same" },
        working: { tdd: "mine" },
      },
    });

    await expect(read.execute()).resolves.toMatchObject({
      ok: true,
      state: {
        stages: {
          proposal: {
            rows: [
              {
                skill: "tdd",
                status: "not-yet-proposed",
                concurrentChange: true,
              },
            ],
          },
        },
      },
    });
  });

  it("leaves a plain local edit with no concurrent change", async () => {
    const read = buildRead({
      movementTrees: {
        remote: { tdd: "same" },
        promote: {},
        local: { tdd: "same" },
        working: { tdd: "edited" },
      },
    });

    await expect(read.execute()).resolves.toMatchObject({
      ok: true,
      state: {
        stages: {
          proposal: {
            rows: [
              {
                skill: "tdd",
                status: "not-yet-proposed",
                concurrentChange: false,
              },
            ],
          },
        },
      },
    });
  });

  it("never flags the author's own unpushed commit as a teammate's change", async () => {
    // Local is ahead, not behind: the author's own unpushed commit (#579).
    const read = buildRead({
      mergeBase: "base",
      trees: { base: [{ name: "tdd", treeHash: "old" }] },
      movementTrees: {
        remote: { tdd: "old" },
        promote: {},
        local: { tdd: "mine-1" },
        working: { tdd: "mine-2" },
      },
    });

    await expect(read.execute()).resolves.toMatchObject({
      ok: true,
      state: {
        stages: {
          proposal: { rows: [{ skill: "tdd", concurrentChange: false }] },
        },
      },
    });
  });

  it("never lets a teammate's change to a different skill block this one's promotion", async () => {
    // origin/HEAD never moved `tdd` since the fork; only `grilling` (#579).
    const read = buildRead({
      mergeBase: "base",
      trees: {
        base: [
          { name: "tdd", treeHash: "same" },
          { name: "grilling", treeHash: "old" },
        ],
      },
      movementTrees: {
        remote: { tdd: "same", grilling: "theirs" },
        promote: {},
        local: { tdd: "same", grilling: "old" },
        working: { tdd: "mine", grilling: "old" },
      },
    });

    await expect(read.execute()).resolves.toMatchObject({
      ok: true,
      state: {
        stages: {
          proposal: { rows: [{ skill: "tdd", concurrentChange: false }] },
        },
      },
    });
  });

  it("reads GitHub once for the whole Harness, naming the origin it read", async () => {
    const seen: string[] = [];
    const read = buildRead({
      readReviews: async (origin) => {
        seen.push(origin.ownerRepo);
        return { outcome: "read", requests: [], complete: true, limit: 100 };
      },
    });

    await read.execute();

    expect(seen).toEqual(["fimoklei/agent-harness"]);
  });

  it("leaves the local stages readable when the review check is unavailable", async () => {
    const read = buildRead({
      review: { outcome: "unavailable" },
      movementTrees: {
        remote: { tdd: "same" },
        promote: {},
        local: { tdd: "same" },
        working: { tdd: "edited" },
      },
    });

    await expect(read.execute()).resolves.toMatchObject({
      ok: true,
      state: {
        stages: {
          proposal: { rows: [{ skill: "tdd", status: "not-yet-proposed" }] },
          review: { outcome: "unavailable" },
          release: { outcome: "read" },
        },
      },
    });
  });
});

describe("ReadHarnessState refresh", () => {
  const AT = new Date("2026-08-03T09:14:00.000Z");

  it("records the time a fetch succeeded, so the state's age is readable", async () => {
    const freshness = stubFreshness();
    const read = buildRead({ freshness });

    const result = await read.refresh(AT);

    expect(result).toMatchObject({
      ok: true,
      state: {
        freshness: {
          outcome: "fetched",
          lastFetchedAt: "2026-08-03T09:14:00.000Z",
        },
      },
    });
  });

  it("keeps the last successful time when a later fetch finds no network", async () => {
    const freshness = stubFreshness({
      outcome: "fetched",
      lastFetchedAt: "2026-08-01T07:00:00.000Z",
    });
    const read = buildRead({ freshness, fetch: async () => "offline" });

    const result = await read.refresh(AT);

    expect(result).toMatchObject({
      ok: true,
      state: {
        freshness: {
          outcome: "offline",
          lastFetchedAt: "2026-08-01T07:00:00.000Z",
        },
      },
    });
  });

  it("holds a fetch that got a reply saying no apart from no network at all", async () => {
    const read = buildRead({
      fetch: async () => "fetch-failed",
      freshness: stubFreshness(),
    });

    const result = await read.refresh(AT);

    expect(result).toMatchObject({
      ok: true,
      state: {
        freshness: { outcome: "fetch-failed", lastFetchedAt: null },
      },
    });
  });

  it("reads back the same harness it fetched, even if the connection changed", async () => {
    // Reconnecting mid-read would fetch one harness and report the other's facts.
    const roots = ["/harness-a", "/harness-b"];
    const fetched: string[] = [];
    const readFor: string[] = [];
    const read = new ReadHarnessState({
      resolveRoot: async () => roots.shift() ?? "/harness-b",
      git: {
        fetch: async (root) => {
          fetched.push(root);
          return "fetched";
        },
        readFacts: async (root) => {
          readFor.push(root);
          return FACTS;
        },
        catchUp: async () => {},
        readCloneSync: async () => "current",
        readSkillTrees: async () => [],
        readSkillAuthors: async () => ({}),
        readMovementTrees: async (root) => {
          readFor.push(root);
          return SETTLED_TREES;
        },
        mergeBaseCommit: async () => null,
        readSkillManifests: async () => ({}),
        publishTag: async () => {
          throw new Error("git port's publishTag was reached");
        },
        pushSkillPromotion: async () => {
          throw new Error("git port's pushSkillPromotion was reached");
        },
        pushSkillDeletion: async () => {
          throw new Error("git port's pushSkillDeletion was reached");
        },
        readWorktreeAmbiguity: async () => null,
        readLocalHeadCommit: async () => "local-head",
        readStagedSkillDifference: async () => false,
        writeSkillTreeInto: async () => "written",
      },
      freshness: stubFreshness(),
      review: {
        readReviews: async () => ({
          outcome: "read",
          requests: [],
          complete: true,
          limit: 100,
        }),
      },
    });

    await read.refresh(AT);

    expect(fetched).toEqual(["/harness-a"]);
    expect(readFor).toEqual(["/harness-a", "/harness-a"]);
  });

  it("catches the clone up with what the fetch brought, before reading it", async () => {
    let fetched = false;
    let sync: CloneSync = "local-changes";
    const read = buildRead({
      fetch: async () => {
        fetched = true;
        return "fetched";
      },
      catchUp: async () => {
        sync = fetched ? "current" : sync;
      },
      readCloneSync: async () => sync,
    });

    await expect(read.refresh(AT)).resolves.toMatchObject({
      ok: true,
      state: { cloneSync: "current" },
    });
  });

  it("reports a clone that could not catch up", async () => {
    const read = buildRead({ readCloneSync: async () => "diverged" });

    await expect(read.refresh(AT)).resolves.toMatchObject({
      ok: true,
      state: { cloneSync: "diverged" },
    });
  });

  it("never moves the clone on a plain read", async () => {
    const catchUp = vi.fn(async () => {});
    const read = buildRead({
      catchUp,
      readCloneSync: async () => "local-changes",
    });

    await expect(read.execute()).resolves.toMatchObject({
      ok: true,
      state: { cloneSync: "local-changes" },
    });
    expect(catchUp).not.toHaveBeenCalled();
  });

  it("answers two refreshes at once with one fetch", async () => {
    // StrictMode and a second tab make two fetches of one clone race each other.
    let fetches = 0;
    let releaseFetch = () => {};
    const held = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });
    const read = buildRead({
      fetch: async () => {
        fetches += 1;
        await held;
        return "fetched";
      },
    });

    const both = Promise.all([read.refresh(AT), read.refresh(AT)]);
    releaseFetch();
    const [first, second] = await both;

    expect(fetches).toBe(1);
    expect(first).toEqual(second);
  });

  it("never fetches from a harness that is not connected", async () => {
    const fetch = vi.fn(async () => "fetched" as const);
    const read = buildRead({ root: undefined, fetch });

    await expect(read.refresh(AT)).resolves.toEqual({
      ok: false,
      error: "not-configured",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
