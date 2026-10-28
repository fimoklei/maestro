import { describe, expect, it } from "vitest";
import { HarnessFetchGate } from "./harness-fetch-gate";
import { InMemoryHarnessGit } from "./harness-git.fake";
import type {
  HarnessReviewPort,
  HarnessReviewRead,
} from "./harness-review-port";
import type { HarnessFreshness } from "./read-harness-state";
import { ReadHarnessState } from "./read-harness-state";

const FETCHED: HarnessFreshness = {
  outcome: "fetched",
  lastFetchedAt: "2026-08-01T07:00:00.000Z",
};

const FETCH_TIME = new Date("2026-08-03T09:14:00.000Z");

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

// v0.5.0 tags `aaa`, which origin/HEAD, local HEAD and disk all hold.
const releasedWorld = (skills: Record<string, string> = { tdd: "same" }) => {
  const git = new InMemoryHarnessGit().settled(skills, "aaa");
  git.tags = [
    { name: "v0.4.0", commit: "old" },
    { name: "v0.5.0", commit: "aaa" },
  ];
  return git;
};

// The default branch moved from the v0.5.0 release `aaa` to `bbb`; the clone is level with it.
const mergedSinceRelease = (
  atRelease: Record<string, string>,
  atTip: Record<string, string>,
) => {
  const git = releasedWorld(atRelease);
  git.commit("bbb", atTip, { parent: "aaa" });
  git.tip = "bbb";
  git.head = "bbb";
  git.working = { ...atTip };
  return git;
};

function buildRead(
  git: InMemoryHarnessGit,
  overrides?: {
    root?: string | undefined;
    resolveRoot?: () => Promise<string | undefined>;
    freshness?: ReturnType<typeof stubFreshness>;
    // Defaults to a complete read that found no request.
    review?: HarnessReviewRead;
    readReviews?: HarnessReviewPort["readReviews"];
    readViewer?: HarnessReviewPort["readViewer"];
  },
) {
  const freshness = overrides?.freshness ?? stubFreshness(FETCHED);
  const gate = new HarnessFetchGate({ git, freshness, now: () => FETCH_TIME });
  return new ReadHarnessState({
    resolveRoot:
      overrides?.resolveRoot ??
      (async () =>
        overrides && "root" in overrides ? overrides.root : "/harness"),
    git,
    freshness,
    fetchHarness: (root) => gate.fetchFresh(root),
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
      readViewer:
        overrides?.readViewer ??
        (async () => ({ outcome: "read", login: "fimoklei" })),
    },
  });
}

describe("ReadHarnessState", () => {
  it("reads the released harness when the highest tag is the default branch tip", async () => {
    const read = buildRead(releasedWorld());

    await expect(read.execute()).resolves.toEqual({
      ok: true,
      state: {
        origin: "github.com/fimoklei/agent-harness",
        github: {
          kind: "link",
          url: "https://github.com/fimoklei/agent-harness",
        },
        releasedVersion: "v0.5.0",
        defaultBranch: "main",
        releaseState: "released",
        freshness: FETCHED,
        cloneSync: "current",
        localHeadCommit: "aaa",
        stages: {
          proposal: { outcome: "read", rows: [], bound: null },
          review: { outcome: "read", rows: [], bound: null },
          release: { outcome: "read", rows: [], bound: null },
        },
      },
    });
  });

  it("lists what merged since the release as green Pending release rows", async () => {
    const read = buildRead(
      mergedSinceRelease(
        { tdd: "t1", grilling: "g1" },
        { tdd: "t2", research: "r1" },
      ),
    );

    const result = await read.execute();

    expect(result).toMatchObject({
      ok: true,
      state: {
        stages: {
          release: {
            outcome: "read",
            rows: [
              {
                name: "grilling",
                status: "not-yet-released",
                change: "deletion",
              },
              {
                name: "research",
                status: "not-yet-released",
                change: "addition",
              },
              { name: "tdd", status: "not-yet-released", change: "edit" },
            ],
          },
        },
      },
    });
  });

  it("calls the comparison unknown when a ref's skills could not be read", async () => {
    // An unreadable ref is not an empty harness: every skill would read as removed.
    const git = mergedSinceRelease({ tdd: "t1" }, { tdd: "t2" });
    git.unreadable.add("aaa");

    await expect(buildRead(git).execute()).resolves.toMatchObject({
      ok: true,
      state: {
        releaseState: "unknown",
        stages: { release: { outcome: "unknown" } },
      },
    });
  });

  it("reads a never-released harness without calling it a failure", async () => {
    const git = releasedWorld();
    git.tags = [];

    const result = await buildRead(git).execute();

    expect(result).toMatchObject({
      ok: true,
      state: { releasedVersion: null, releaseState: "never-released" },
    });
  });

  it("reads merged work the released harness does not carry as pending release", async () => {
    const read = buildRead(mergedSinceRelease({ tdd: "t1" }, { tdd: "t2" }));

    const result = await read.execute();

    expect(result).toMatchObject({
      ok: true,
      state: { releasedVersion: "v0.5.0", releaseState: "pending-release" },
    });
  });

  it("reads a default branch that moved without touching a skill as released", async () => {
    // A commit after the tag can move the branch and change no skill (#845).
    const read = buildRead(mergedSinceRelease({ tdd: "t1" }, { tdd: "t1" }));

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
    const git = releasedWorld();
    git.defaultBranch = null;
    git.tip = null;

    await expect(buildRead(git).execute()).resolves.toMatchObject({
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
    const git = releasedWorld();
    git.tags = [];
    const read = buildRead(git, { freshness: stubFreshness() });

    await expect(read.execute()).resolves.toMatchObject({
      ok: true,
      state: { releasedVersion: null, releaseState: "unknown" },
    });
  });

  it("never calls a harness unreleased on tags it could not read", async () => {
    const git = releasedWorld();
    git.tags = null;

    await expect(buildRead(git).execute()).resolves.toMatchObject({
      ok: true,
      state: { releasedVersion: null, releaseState: "unknown" },
    });
  });

  it("refuses when no harness is connected", async () => {
    const read = buildRead(releasedWorld(), { root: undefined });

    await expect(read.execute()).resolves.toEqual({
      ok: false,
      error: "not-configured",
    });
  });

  it("refuses an origin apm could never resolve, rather than showing a guess", async () => {
    const git = releasedWorld();
    git.originUrl = "/srv/mirrors/harness.git";

    await expect(buildRead(git).execute()).resolves.toEqual({
      ok: false,
      error: "no-usable-origin",
    });
  });
});

describe("ReadHarnessState stages", () => {
  it("gives each skill a row in every stage it belongs to, in name order", async () => {
    const git = releasedWorld({ docs: "same", tdd: "same" });
    git.commit("tdd-tip", { docs: "same", tdd: "pushed" }, { parent: "aaa" });
    git.promote = { tdd: "tdd-tip" };
    git.working = { docs: "edited", tdd: "same" };

    await expect(buildRead(git).execute()).resolves.toMatchObject({
      ok: true,
      state: {
        stages: {
          proposal: {
            rows: [
              { name: "docs", status: "not-yet-proposed" },
              // The author's own proposal is never a teammate's change.
              {
                name: "tdd",
                status: "new-local-work",
                concurrentChange: false,
              },
            ],
          },
          review: { rows: [{ name: "tdd", status: "pull-request-missing" }] },
        },
      },
    });
  });

  it("finds a skill that exists only on a promote branch", async () => {
    // A new skill pushed for review is in none of the other three refs.
    const git = releasedWorld({});
    git.commit("fresh-tip", { fresh: "pushed" }, { parent: "aaa" });
    git.promote = { fresh: "fresh-tip" };

    await expect(buildRead(git).execute()).resolves.toMatchObject({
      ok: true,
      state: {
        stages: {
          review: {
            rows: [{ name: "fresh", status: "pull-request-missing" }],
          },
        },
      },
    });
  });

  it("surfaces a promote branch that proposes deleting its skill", async () => {
    const git = releasedWorld();
    git.commit("tdd-tip", {}, { parent: "aaa" });
    git.promote = { tdd: "tdd-tip" };

    await expect(buildRead(git).execute()).resolves.toMatchObject({
      ok: true,
      state: {
        stages: {
          // The folder still on disk differs from the proposed deletion,
          // which is the author's own work, never a teammate's.
          proposal: {
            rows: [
              {
                name: "tdd",
                status: "new-local-work",
                concurrentChange: false,
              },
            ],
          },
          review: {
            rows: [
              {
                name: "tdd",
                status: "pull-request-missing",
                change: "deletion",
              },
            ],
          },
        },
      },
    });
  });

  it("marks a skill deleted from disk as a local deletion", async () => {
    const git = releasedWorld();
    git.working = {};

    await expect(buildRead(git).execute()).resolves.toMatchObject({
      ok: true,
      state: {
        stages: {
          proposal: {
            rows: [
              { name: "tdd", status: "not-yet-proposed", change: "deletion" },
            ],
          },
        },
      },
    });
  });

  it("reads a renamed directory as one deletion and one addition", async () => {
    // Renames are not inferred (#575).
    const git = releasedWorld({ "old-name": "same" });
    git.working = { "new-name": "same" };

    await expect(buildRead(git).execute()).resolves.toMatchObject({
      ok: true,
      state: {
        stages: {
          proposal: {
            rows: [
              {
                name: "new-name",
                status: "not-yet-proposed",
                change: "addition",
              },
              {
                name: "old-name",
                status: "not-yet-proposed",
                change: "deletion",
              },
            ],
          },
        },
      },
    });
  });

  it("leaves a clone that is only behind with nothing of its own waiting", async () => {
    const git = new InMemoryHarnessGit().settled({ tdd: "older" }, "older");
    git.commit("newer", { tdd: "newer" }, { parent: "older" });
    git.tip = "newer";

    await expect(buildRead(git).execute()).resolves.toMatchObject({
      ok: true,
      state: { stages: { proposal: { rows: [] }, review: { rows: [] } } },
    });
  });

  it("never reads a skill this clone has not pulled yet as a local deletion", async () => {
    // A clone that is behind, never the author's own deletion (#575).
    const git = new InMemoryHarnessGit().settled({}, "mine");
    git.commit("theirs", { tdd: "newer" }, { parent: "mine" });
    git.tip = "theirs";

    await expect(buildRead(git).execute()).resolves.toMatchObject({
      ok: true,
      state: { stages: { proposal: { rows: [] } } },
    });
  });

  it("flags a skill this clone has not pulled yet as a concurrent change once it is edited locally", async () => {
    const git = new InMemoryHarnessGit().settled({}, "mine");
    git.commit("theirs", { tdd: "newer" }, { parent: "mine" });
    git.tip = "theirs";
    git.working = { tdd: "new" };

    await expect(buildRead(git).execute()).resolves.toMatchObject({
      ok: true,
      state: {
        stages: {
          proposal: { rows: [{ name: "tdd", concurrentChange: true }] },
        },
      },
    });
  });

  it("calls the local stages unknown when a local ref could not be read", async () => {
    // An empty table would claim nothing is waiting, which this read cannot back.
    const git = releasedWorld();
    git.unreadable.add("HEAD");

    await expect(buildRead(git).execute()).resolves.toMatchObject({
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
    const git = new InMemoryHarnessGit().settled({ tdd: "same" }, "fork");
    git.commit("theirs", { tdd: "theirs" }, { parent: "fork" });
    git.tip = "theirs";
    git.working = { tdd: "mine" };

    await expect(buildRead(git).execute()).resolves.toMatchObject({
      ok: true,
      state: {
        stages: {
          proposal: {
            rows: [
              {
                name: "tdd",
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
    const git = releasedWorld();
    git.working = { tdd: "edited" };

    await expect(buildRead(git).execute()).resolves.toMatchObject({
      ok: true,
      state: {
        stages: {
          proposal: {
            rows: [
              {
                name: "tdd",
                status: "not-yet-proposed",
                change: "edit",
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
    const git = new InMemoryHarnessGit().settled({ tdd: "old" }, "base");
    git.commit("mine", { tdd: "mine-1" }, { parent: "base" });
    git.head = "mine";
    git.working = { tdd: "mine-2" };

    await expect(buildRead(git).execute()).resolves.toMatchObject({
      ok: true,
      state: {
        stages: {
          proposal: { rows: [{ name: "tdd", concurrentChange: false }] },
        },
      },
    });
  });

  it("never lets a teammate's change to a different skill block this one's promotion", async () => {
    // origin/HEAD never moved `tdd` since the fork; only `grilling` (#579).
    const git = new InMemoryHarnessGit();
    git.commit("base", { tdd: "same", grilling: "old" });
    git.commit(
      "theirs",
      { tdd: "same", grilling: "theirs" },
      { parent: "base" },
    );
    git.commit("mine", { tdd: "mine", grilling: "old" }, { parent: "base" });
    git.tip = "theirs";
    git.head = "mine";
    git.working = { tdd: "mine-2", grilling: "old" };

    await expect(buildRead(git).execute()).resolves.toMatchObject({
      ok: true,
      state: {
        stages: {
          proposal: { rows: [{ name: "tdd", concurrentChange: false }] },
        },
      },
    });
  });

  it("reads GitHub once for the whole Harness, naming the origin it read", async () => {
    const seen: string[] = [];
    const read = buildRead(releasedWorld(), {
      readReviews: async (origin) => {
        seen.push(origin.ownerRepo);
        return { outcome: "read", requests: [], complete: true, limit: 100 };
      },
    });

    await read.execute();

    expect(seen).toEqual(["fimoklei/agent-harness"]);
  });

  it("reads another contributor's open request as the one the skill waits on", async () => {
    const seen: string[] = [];
    const git = releasedWorld();
    git.commit("tdd-tip", { tdd: "theirs" }, { parent: "aaa" });
    git.promote = { tdd: "tdd-tip" };
    const read = buildRead(git, {
      review: {
        outcome: "read",
        requests: [
          {
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
            author: "teammate",
            title: "Edit skill: tdd",
          },
        ],
        complete: true,
        limit: 100,
      },
      readViewer: async (origin) => {
        seen.push(origin.ownerRepo);
        return { outcome: "read", login: "fimoklei" };
      },
    });

    await expect(read.execute()).resolves.toMatchObject({
      ok: true,
      state: {
        stages: {
          review: {
            rows: [
              {
                name: "tdd",
                status: "proposed-by-other",
                waitingOn: "teammate",
              },
            ],
          },
        },
      },
    });
    expect(seen).toEqual(["fimoklei/agent-harness"]);
  });

  it("asks nobody who is signed in when no review read came back", async () => {
    let asked = false;
    const read = buildRead(releasedWorld(), {
      review: { outcome: "unavailable", reason: "no-gh" },
      readViewer: async () => {
        asked = true;
        return { outcome: "unavailable" };
      },
    });

    await read.execute();

    expect(asked).toBe(false);
  });

  it("leaves the local stages readable when the review check is unavailable", async () => {
    const git = releasedWorld();
    git.working = { tdd: "edited" };
    const read = buildRead(git, {
      review: { outcome: "unavailable", reason: "no-gh" },
    });

    await expect(read.execute()).resolves.toMatchObject({
      ok: true,
      state: {
        stages: {
          proposal: { rows: [{ name: "tdd", status: "not-yet-proposed" }] },
          review: { outcome: "unavailable" },
          release: { outcome: "read" },
        },
      },
    });
  });
});

describe("ReadHarnessState refresh", () => {
  it("records the time a fetch succeeded, so the state's age is readable", async () => {
    const read = buildRead(releasedWorld(), { freshness: stubFreshness() });

    const result = await read.refresh();

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
    const git = releasedWorld();
    git.fetchOutcomes = ["offline"];
    const read = buildRead(git, {
      freshness: stubFreshness({
        outcome: "fetched",
        lastFetchedAt: "2026-08-01T07:00:00.000Z",
      }),
    });

    const result = await read.refresh();

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
    const git = releasedWorld();
    git.fetchOutcomes = ["fetch-failed"];
    const read = buildRead(git, { freshness: stubFreshness() });

    const result = await read.refresh();

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
    const git = releasedWorld();
    git.root = "/harness-a";
    const read = buildRead(git, {
      resolveRoot: async () => roots.shift() ?? "/harness-b",
    });

    await expect(read.refresh()).resolves.toMatchObject({
      ok: true,
      state: { localHeadCommit: "aaa" },
    });
    expect(git.fetches).toBe(1);
  });

  it("catches the clone up with what the fetch brought, before reading it", async () => {
    const git = releasedWorld();
    git.cloneSync = "behind";
    git.teammatePushes("bbb", { tdd: "theirs" });

    await expect(buildRead(git).refresh()).resolves.toMatchObject({
      ok: true,
      state: { cloneSync: "current", localHeadCommit: "bbb" },
    });
  });

  it("reports a clone that could not catch up", async () => {
    const git = releasedWorld();
    git.cloneSync = "diverged";

    await expect(buildRead(git).refresh()).resolves.toMatchObject({
      ok: true,
      state: { cloneSync: "diverged" },
    });
  });

  it("never moves the clone on a plain read", async () => {
    const git = releasedWorld();
    git.commit("bbb", { tdd: "theirs" }, { parent: "aaa" });
    git.tip = "bbb";
    git.cloneSync = "behind";

    await expect(buildRead(git).execute()).resolves.toMatchObject({
      ok: true,
      state: { cloneSync: "behind", localHeadCommit: "aaa" },
    });
    expect(git.caughtUp).toEqual([]);
  });

  it("answers two refreshes at once with one fetch", async () => {
    // StrictMode and a second tab make two fetches of one clone race each other.
    let releaseFetch = () => {};
    const git = releasedWorld();
    git.fetchHold = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });
    const read = buildRead(git);

    const both = Promise.all([read.refresh(), read.refresh()]);
    releaseFetch();
    const [first, second] = await both;

    expect(git.fetches).toBe(1);
    expect(first).toEqual(second);
  });

  it("never fetches from a harness that is not connected", async () => {
    const git = releasedWorld();
    const read = buildRead(git, { root: undefined });

    await expect(read.refresh()).resolves.toEqual({
      ok: false,
      error: "not-configured",
    });
    expect(git.fetches).toBe(0);
  });
});
