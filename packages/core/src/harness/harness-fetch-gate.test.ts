import { describe, expect, it } from "vitest";
import { HarnessFetchGate } from "./harness-fetch-gate";
import { InMemoryHarnessGit } from "./harness-git.fake";
import type { HarnessFreshness } from "./read-harness-state";

const ROOT = "/harness";
const START = Date.parse("2026-08-01T07:00:00.000Z");
const MAX_AGE = 30_000;

function buildGate(git = new InMemoryHarnessGit()) {
  let now = START;
  let current: HarnessFreshness = { outcome: null, lastFetchedAt: null };
  const freshness = {
    read: async (_root: string) => current,
    record: async (_root: string, next: HarnessFreshness) => {
      current = next;
    },
  };
  const gate = new HarnessFetchGate({
    git,
    freshness,
    now: () => new Date(now),
  });
  return {
    git,
    gate,
    freshness,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

// The next fetch waits until the returned release is called.
function holdFetches(git: InMemoryHarnessGit): () => void {
  let release = () => {};
  git.fetchHold = new Promise<void>((resolve) => {
    release = resolve;
  });
  return release;
}

describe("HarnessFetchGate", () => {
  it("answers ten concurrent calls with one fetch and one outcome", async () => {
    const { git, gate } = buildGate();
    const release = holdFetches(git);

    const all = Promise.all(
      Array.from({ length: 10 }, () => gate.fetch(ROOT, MAX_AGE)),
    );
    release();
    const outcomes = await all;

    expect(git.fetches).toBe(1);
    expect(outcomes).toEqual(Array.from({ length: 10 }, () => "fetched"));
  });

  it("reuses a fetch within the maximum age", async () => {
    const { git, gate, advance } = buildGate();
    await gate.fetch(ROOT, MAX_AGE);

    advance(MAX_AGE - 1);
    await expect(gate.fetch(ROOT, MAX_AGE)).resolves.toBe("fetched");

    expect(git.fetches).toBe(1);
  });

  it("fetches again once the last fetch is older than the maximum age", async () => {
    const { git, gate, advance } = buildGate();
    await gate.fetch(ROOT, MAX_AGE);

    advance(MAX_AGE);
    await gate.fetch(ROOT, MAX_AGE);

    expect(git.fetches).toBe(2);
  });

  it("fetches at a maximum age of zero even when the last fetch is fresh", async () => {
    const { git, gate } = buildGate();
    await gate.fetch(ROOT, MAX_AGE);

    await gate.fetch(ROOT, 0);

    expect(git.fetches).toBe(2);
  });

  it("shares an in-flight fetch with a call at a maximum age of zero", async () => {
    const { git, gate } = buildGate();
    const release = holdFetches(git);

    const both = Promise.all([gate.fetch(ROOT, MAX_AGE), gate.fetch(ROOT, 0)]);
    release();
    await both;

    expect(git.fetches).toBe(1);
  });

  it("fetches again after the root is invalidated, even within the maximum age", async () => {
    const { git, gate } = buildGate();
    await gate.fetch(ROOT, MAX_AGE);

    gate.invalidate(ROOT);
    await gate.fetch(ROOT, MAX_AGE);

    expect(git.fetches).toBe(2);
  });

  it("fetches again after an invalidation mid-flight, never beside the running fetch", async () => {
    const { git, gate } = buildGate();
    const release = holdFetches(git);
    const first = gate.fetch(ROOT, MAX_AGE);

    gate.invalidate(ROOT);
    const second = gate.fetch(ROOT, MAX_AGE);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(git.fetches).toBe(1);

    release();
    await Promise.all([first, second]);
    expect(git.fetches).toBe(2);
  });

  it("records a successful fetch at the clock's time", async () => {
    const { gate, freshness } = buildGate();

    await gate.fetch(ROOT, MAX_AGE);

    await expect(freshness.read(ROOT)).resolves.toEqual({
      outcome: "fetched",
      lastFetchedAt: "2026-08-01T07:00:00.000Z",
    });
  });

  it("keeps the previous last-fetched time when a fetch fails", async () => {
    const git = new InMemoryHarnessGit();
    git.fetchOutcomes = ["fetched", "offline"];
    const { gate, freshness, advance } = buildGate(git);
    await gate.fetch(ROOT, MAX_AGE);

    advance(MAX_AGE);
    await expect(gate.fetch(ROOT, MAX_AGE)).resolves.toBe("offline");

    await expect(freshness.read(ROOT)).resolves.toEqual({
      outcome: "offline",
      lastFetchedAt: "2026-08-01T07:00:00.000Z",
    });
  });

  it("catches the clone up with what the fetch brought", async () => {
    const git = new InMemoryHarnessGit().settled({ tdd: "ours" }, "aaa");
    git.cloneSync = "behind";
    git.teammatePushes("bbb", { tdd: "theirs" });
    const { gate } = buildGate(git);

    await gate.fetch(ROOT, MAX_AGE);

    expect(git.caughtUp).toEqual(["bbb"]);
  });
});
