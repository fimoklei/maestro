import { describe, expect, it, vi } from "vitest";
import type {
  HarnessFacts,
  HarnessFetchOutcome,
  HarnessFreshness,
} from "./read-harness-state";
import { ReadHarnessState } from "./read-harness-state";

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

function buildRead(overrides?: {
  facts?: Partial<HarnessFacts>;
  root?: string | undefined;
  resolveRoot?: () => Promise<string | undefined>;
  fetch?: () => Promise<HarnessFetchOutcome>;
  freshness?: ReturnType<typeof stubFreshness>;
}) {
  return new ReadHarnessState({
    resolveRoot:
      overrides?.resolveRoot ??
      (async () =>
        overrides && "root" in overrides ? overrides.root : "/harness"),
    git: {
      fetch: overrides?.fetch ?? (async () => "fetched"),
      readFacts: async () => ({ ...FACTS, ...overrides?.facts }),
    },
    freshness: overrides?.freshness ?? stubFreshness(),
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
        freshness: { outcome: null, lastFetchedAt: null },
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
      state: { releasedVersion: "v0.5.0", releaseState: "unknown" },
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
    const read = buildRead({ fetch: async () => "fetch-failed" });

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
      },
      freshness: stubFreshness(),
    });

    await read.refresh(AT);

    expect(fetched).toEqual(["/harness-a"]);
    expect(readFor).toEqual(["/harness-a"]);
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
