import { describe, expect, it, vi } from "vitest";
import type {
  HarnessFacts,
  HarnessFetchOutcome,
  HarnessFreshness,
  HarnessSkillTrees,
} from "./read-harness-state";
import { ReadHarnessState } from "./read-harness-state";
import type { HarnessSkillTree } from "./skill-movements";

// A harness Maestro has fetched at least once: only then do the tags it reads
// mean anything.
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

// An in-memory freshness record, so a refresh can be observed the way a later
// read would see it rather than through a spy on the writer.
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

// Skill trees per ref, keyed by the commit the use-case asks about. Anything
// unlisted is a ref carrying no skills at all; an explicit null is a ref the
// adapter could not read.
type TreesByRef = Record<string, HarnessSkillTree[] | null>;

// A harness whose one skill sits at the same content everywhere: the quiet
// case each movement test moves a single ref away from.
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
  // Who the released ref's own history names, where the default branch's
  // history names nobody.
  authorsAtRelease?: Record<string, string>;
  // The four local refs behind the movement tables, unrelated to `trees`.
  movementTrees?: Partial<HarnessSkillTrees> | null;
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
      readSkillManifests: async (
        _root: string,
        _ref: string,
        names: string[],
      ) => Object.fromEntries(names.map((name) => [name, null])),
      publishTag: async () => {
        throw new Error("git port's publishTag was reached");
      },
    },
    freshness: overrides?.freshness ?? stubFreshness(FETCHED),
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
        pendingRelease: [],
        freshness: FETCHED,
        movements: [],
      },
    });
  });

  it("names each movement's author alongside what merged since the release", async () => {
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
        pendingRelease: [
          { kind: "removed", name: "grilling", author: "Linus" },
          { kind: "added", name: "research", author: "Grace" },
          { kind: "changed", name: "tdd", author: "Ada" },
        ],
      },
    });
  });

  it("calls the comparison unknown when a ref's skills could not be read", async () => {
    // An unreadable ref is not an empty harness: reading it as one would
    // report every skill as removed (LEARNINGS.md · J04).
    const read = buildRead({
      facts: { defaultBranchCommit: "bbb" },
      trees: { aaa: [{ name: "tdd", treeHash: "t1" }], bbb: null },
    });

    await expect(read.execute()).resolves.toMatchObject({
      ok: true,
      state: { releaseState: "unknown", pendingRelease: [] },
    });
  });

  it("names a removal's author from the release when the branch never had it", async () => {
    // A tag on another history carries a skill the default branch never saw,
    // so a log of that path at the branch answers nothing.
    const read = buildRead({
      facts: { defaultBranchCommit: "bbb" },
      trees: { aaa: [{ name: "grilling", treeHash: "g1" }], bbb: [] },
      authorsAtRelease: { grilling: "Linus" },
    });

    await expect(read.execute()).resolves.toMatchObject({
      ok: true,
      state: {
        pendingRelease: [
          { kind: "removed", name: "grilling", author: "Linus" },
        ],
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
    const read = buildRead({ facts: { defaultBranchCommit: "bbb" } });

    const result = await read.execute();

    expect(result).toMatchObject({
      ok: true,
      state: { releasedVersion: "v0.5.0", releaseState: "pending-release" },
    });
  });

  it("does not claim work is waiting while the default branch is unknown", async () => {
    // A clone that has never fetched has no origin/HEAD. Reading that as
    // "merged work is pending" would invent a fact from a missing one.
    const read = buildRead({
      facts: { defaultBranch: null, defaultBranchCommit: null },
    });

    const result = await read.execute();

    expect(result).toMatchObject({
      ok: true,
      state: {
        releasedVersion: "v0.5.0",
        releaseState: "unknown",
        // Nothing to compare against is not "nothing merged".
        pendingRelease: [],
      },
    });
  });

  it("never calls a harness unreleased on tags no fetch has confirmed", async () => {
    // Before Maestro's first successful fetch the clone carries none of the
    // tags Maestro reads, and an empty list there means "not looked yet" —
    // reading it as "no release exists" invents the very fact #516 forbids.
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
    // A failed read of the tag namespace is not an empty one. Reading it as
    // "no release exists" is the same invented fact, one layer down.
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

describe("ReadHarnessState movements", () => {
  it("lists every skill that has moved, one state each, in name order", async () => {
    const read = buildRead({
      movementTrees: {
        remote: { docs: "same", tdd: "same" },
        promote: { tdd: "pushed" },
        local: { docs: "same", tdd: "same" },
        working: { docs: "edited", tdd: "same" },
      },
    });

    await expect(read.execute()).resolves.toMatchObject({
      ok: true,
      state: {
        movements: [
          { skill: "docs", state: "pending-promotion" },
          { skill: "tdd", state: "pending-review" },
        ],
      },
    });
  });

  it("finds a skill that exists only on a promote branch", async () => {
    // A brand-new skill someone pushed for review is in none of the other
    // three refs; taking only origin/HEAD's names would miss it entirely.
    const read = buildRead({
      movementTrees: {
        remote: {},
        promote: { fresh: "pushed" },
        local: {},
        working: {},
      },
    });

    await expect(read.execute()).resolves.toMatchObject({
      ok: true,
      state: { movements: [{ skill: "fresh", state: "pending-review" }] },
    });
  });

  it("surfaces a promote branch that proposes deleting its skill", async () => {
    // The branch carries no tree for the skill, which is not the same fact as
    // there being no branch — a deletion is a review like any other.
    const read = buildRead({
      movementTrees: {
        remote: { tdd: "same" },
        promote: { tdd: null },
        local: { tdd: "same" },
        working: { tdd: "same" },
      },
    });

    await expect(read.execute()).resolves.toMatchObject({
      ok: true,
      state: { movements: [{ skill: "tdd", state: "pending-review" }] },
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
      state: { movements: [] },
    });
  });

  it("calls the whole picture unknown when a local ref could not be read", async () => {
    // An empty table would say nothing is waiting, which is a claim this read
    // cannot back (LEARNINGS.md · J04).
    const read = buildRead({ movementTrees: null });

    await expect(read.execute()).resolves.toMatchObject({
      ok: true,
      state: { movements: [], releaseState: "unknown" },
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
    // Reconnecting between the fetch and the read would otherwise fetch one
    // harness and report the other's facts.
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
        readSkillTrees: async () => [],
        readSkillAuthors: async () => ({}),
        readMovementTrees: async (root) => {
          readFor.push(root);
          return SETTLED_TREES;
        },
        readSkillManifests: async () => ({}),
        publishTag: async () => {
          throw new Error("git port's publishTag was reached");
        },
      },
      freshness: stubFreshness(),
    });

    await read.refresh(AT);

    expect(fetched).toEqual(["/harness-a"]);
    expect(readFor).toEqual(["/harness-a", "/harness-a"]);
  });

  it("answers two refreshes at once with one fetch", async () => {
    // The view opens under StrictMode and a second tab is an ordinary day:
    // two fetches of one clone race each other over the same git refs.
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
