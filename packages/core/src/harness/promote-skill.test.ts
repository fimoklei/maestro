import { describe, expect, it } from "vitest";
import { InFlightLocks } from "../deploy/in-flight-locks";
import { HarnessFetchGate } from "./harness-fetch-gate";
import { InMemoryHarnessGit, skillRef } from "./harness-git.fake";
import type {
  HarnessReviewRead,
  NewReviewRequest,
  ReviewRequest,
  ReviewWriteOutcome,
} from "./harness-review-port";
import { PromoteSkill } from "./promote-skill";
import type { HarnessFreshness } from "./read-harness-state";

const AT = new Date("2026-08-09T12:00:00.000Z");

const READ_MAX_AGE_MS = 30_000;

// A gate a Drift or Harness read shares with the push.
const readGate = (git: InMemoryHarnessGit) =>
  new HarnessFetchGate({
    git,
    freshness: { read: async () => FRESHNESS, record: async () => {} },
    now: () => AT,
  });

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
  author: "fimoklei",
  title: "Promote skill: tdd",
  ...over,
});

const FRESHNESS: HarnessFreshness = {
  outcome: "fetched",
  lastFetchedAt: "2026-08-01T07:00:00.000Z",
};

// A new skill on disk, on a clone level with an origin/HEAD that lacks it.
const newSkillWorld = () => {
  const git = new InMemoryHarnessGit().settled({}, "head");
  git.working = { tdd: "mine" };
  return git;
};

function buildPromote(
  git: InMemoryHarnessGit,
  overrides?: {
    root?: string | undefined;
    freshness?: HarnessFreshness;
    onFreshnessRecord?: (root: string, freshness: HarnessFreshness) => void;
    review?: HarnessReviewRead;
    onCreate?: (request: NewReviewRequest) => void;
    onEdit?: (number: number, title: string) => void;
    createOutcome?: ReviewWriteOutcome;
    fetchGate?: HarnessFetchGate;
  },
) {
  return new PromoteSkill({
    resolveRoot: async () =>
      overrides && "root" in overrides ? overrides.root : "/harness",
    locks: new InFlightLocks(),
    git,
    fetchGate:
      overrides?.fetchGate ??
      new HarnessFetchGate({
        git,
        freshness: {
          read: async () => overrides?.freshness ?? FRESHNESS,
          record: async (root, freshness) => {
            overrides?.onFreshnessRecord?.(root, freshness);
          },
        },
        now: () => AT,
      }),
    review: {
      readReviews: async () => overrides?.review ?? EMPTY_REVIEW,
      readViewer: async () => ({ outcome: "read", login: "fimoklei" }),
      createRequest: async (_origin, made) => {
        overrides?.onCreate?.(made);
        return overrides?.createOutcome ?? { ok: true };
      },
      reopenRequest: async () => ({ ok: true }),
      closeRequest: async () => ({ ok: true }),
      editRequest: async (_origin, number, { title }) => {
        overrides?.onEdit?.(number, title);
        return { ok: true };
      },
    },
  });
}

describe("PromoteSkill", () => {
  it("pushes the skill and answers with the branch and its pull-request page", async () => {
    const git = newSkillWorld();

    await expect(buildPromote(git).execute(skillRef("tdd"))).resolves.toEqual({
      ok: true,
      branch: "maestro/tdd",
      pullRequestUrl:
        "https://github.com/fimoklei/agent-harness/compare/main...maestro/tdd?expand=1",
    });
    expect(git.pushed).toEqual([
      { type: "skill", name: "tdd", base: "head", kind: "addition" },
    ]);
  });

  it("builds the push on the fetched tip, never local HEAD, so local commits never ride along", async () => {
    const git = new InMemoryHarnessGit();
    git.commit("head", { tdd: "old" });
    git.commit("local", { tdd: "mine", jobs: "unpushed" }, { parent: "head" });
    git.tip = "head";
    git.head = "local";
    git.working = { tdd: "mine", jobs: "unpushed" };

    await expect(
      buildPromote(git).execute(skillRef("tdd")),
    ).resolves.toMatchObject({
      ok: true,
    });
    expect(git.pushed.map((push) => push.base)).toEqual(["head"]);
  });

  // Decided against the default branch just fetched, never the cockpit's read.
  it.each<[string, InMemoryHarnessGit, string]>([
    ["lacks", newSkillWorld(), "Add skill: tdd"],
    [
      "holds",
      (() => {
        const git = new InMemoryHarnessGit().settled({ tdd: "old" }, "head");
        git.working = { tdd: "mine" };
        return git;
      })(),
      "Edit skill: tdd",
    ],
  ])(
    "opens the pull request for a skill the default branch %s, titled by its kind",
    async (_, git, title) => {
      const created: NewReviewRequest[] = [];
      const promote = buildPromote(git, {
        onCreate: (made) => created.push(made),
      });

      await expect(promote.execute(skillRef("tdd"))).resolves.toMatchObject({
        ok: true,
      });
      expect(created).toEqual([
        {
          head: "maestro/tdd",
          base: "main",
          title,
          body: "Proposed from the Maestro cockpit.",
        },
      ]);
    },
  );

  it("sends an update to the open proposal without touching the request", async () => {
    // Leaving the request alone keeps GitHub's review verdict standing (#827).
    const created: NewReviewRequest[] = [];
    const promote = buildPromote(newSkillWorld(), {
      review: { ...EMPTY_REVIEW, requests: [openRequest()] },
      onCreate: (made) => created.push(made),
    });

    await expect(promote.execute(skillRef("tdd"))).resolves.toMatchObject({
      ok: true,
    });
    expect(created).toEqual([]);
  });

  it("retitles an open deletion request as the change it now carries", async () => {
    const edited: [number, string][] = [];
    const promote = buildPromote(newSkillWorld(), {
      review: {
        ...EMPTY_REVIEW,
        requests: [openRequest({ title: "Delete skill: tdd" })],
      },
      onEdit: (number, title) => edited.push([number, title]),
    });

    await expect(promote.execute(skillRef("tdd"))).resolves.toMatchObject({
      ok: true,
    });
    expect(edited).toEqual([[45, "Add skill: tdd"]]);
  });

  it("refuses while another contributor's request is open on the branch", async () => {
    const git = newSkillWorld();
    const promote = buildPromote(git, {
      review: {
        ...EMPTY_REVIEW,
        requests: [openRequest({ author: "teammate" })],
      },
    });

    await expect(promote.execute(skillRef("tdd"))).resolves.toEqual({
      ok: false,
      error: "proposed-by-other",
    });
    expect(git.pushed).toEqual([]);
  });

  it("refuses while more than one open request matches the branch", async () => {
    const git = newSkillWorld();
    const promote = buildPromote(git, {
      review: {
        ...EMPTY_REVIEW,
        requests: [openRequest({ number: 41 }), openRequest({ number: 44 })],
      },
    });

    await expect(promote.execute(skillRef("tdd"))).resolves.toEqual({
      ok: false,
      error: "extra-requests",
    });
    expect(git.pushed).toEqual([]);
  });

  it("still pushes when GitHub cannot be asked, leaving the request missing", async () => {
    // A gh failure degrades the review capability alone; the branch still lands.
    const git = newSkillWorld();
    const promote = buildPromote(git, { review: { outcome: "unavailable" } });

    await expect(promote.execute(skillRef("tdd"))).resolves.toMatchObject({
      ok: true,
    });
    expect(git.pushed).toHaveLength(1);
  });

  it("keeps the push when the request could not be opened", async () => {
    const promote = buildPromote(newSkillWorld(), {
      createOutcome: { ok: false, error: "failed" },
    });

    await expect(promote.execute(skillRef("tdd"))).resolves.toMatchObject({
      ok: true,
    });
  });

  it("refuses when no harness is connected", async () => {
    const promote = buildPromote(newSkillWorld(), { root: undefined });

    await expect(promote.execute(skillRef("tdd"))).resolves.toEqual({
      ok: false,
      error: "not-configured",
    });
  });

  it("refuses an origin apm could never resolve", async () => {
    const git = newSkillWorld();
    git.originUrl = "/srv/mirror.git";

    await expect(buildPromote(git).execute(skillRef("tdd"))).resolves.toEqual({
      ok: false,
      error: "no-usable-origin",
    });
  });

  it("refuses a name that is not a plain skill directory, without reaching git", async () => {
    const git = newSkillWorld();

    await expect(
      buildPromote(git).execute(skillRef("../secrets")),
    ).resolves.toEqual({
      ok: false,
      error: "invalid-skill",
    });
    expect(git.fetches).toBe(0);
    expect(git.pushed).toEqual([]);
  });

  it("reports a fetch that got no answer as the unfresh state release uses", async () => {
    const git = newSkillWorld();
    git.fetchOutcomes = ["offline"];

    await expect(buildPromote(git).execute(skillRef("tdd"))).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
    expect(git.pushed).toEqual([]);
  });

  it("records what the fetch found, so the screen shows this call's own reach", async () => {
    const recorded: HarnessFreshness[] = [];
    const promote = buildPromote(newSkillWorld(), {
      onFreshnessRecord: (_root, freshness) => recorded.push(freshness),
    });

    await promote.execute(skillRef("tdd"));

    // Once per fetch: the recheck right before the push fetches again (#579).
    expect(recorded).toEqual([
      { outcome: "fetched", lastFetchedAt: AT.toISOString() },
      { outcome: "fetched", lastFetchedAt: AT.toISOString() },
    ]);
  });

  it("keeps the last successful time when this fetch failed", async () => {
    const recorded: HarnessFreshness[] = [];
    const git = newSkillWorld();
    git.fetchOutcomes = ["fetch-failed"];
    const promote = buildPromote(git, {
      onFreshnessRecord: (_root, freshness) => recorded.push(freshness),
    });

    await promote.execute(skillRef("tdd"));

    expect(recorded).toEqual([
      { outcome: "fetch-failed", lastFetchedAt: FRESHNESS.lastFetchedAt },
    ]);
  });

  it("refuses when the remote's default branch could not be read", async () => {
    const git = newSkillWorld();
    git.defaultBranch = null;
    git.tip = null;

    await expect(buildPromote(git).execute(skillRef("tdd"))).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
  });

  it("reports a skill that is not in the working harness", async () => {
    const git = newSkillWorld();
    git.working = {};

    await expect(buildPromote(git).execute(skillRef("tdd"))).resolves.toEqual({
      ok: false,
      error: "skill-missing",
    });
  });

  it.each([
    ["never reached the remote", "offline", "no-answer"],
    [
      "went to another destination than the link names",
      "push-elsewhere",
      "push-elsewhere",
    ],
    [
      "was refused, so the author can press again",
      "push-failed",
      "promote-failed",
    ],
  ] as const)("reports a push that %s", async (_, outcome, error) => {
    const git = newSkillWorld();
    git.pushOutcome = outcome;

    await expect(buildPromote(git).execute(skillRef("tdd"))).resolves.toEqual({
      ok: false,
      error,
    });
  });

  it("refuses to push over a teammate's change that landed since the last refresh", async () => {
    const git = new InMemoryHarnessGit();
    git.commit("fork", { tdd: "old" });
    git.commit("theirs", { tdd: "theirs" }, { parent: "fork" });
    git.commit("mine", { tdd: "mine" }, { parent: "fork" });
    git.tip = "theirs";
    git.head = "mine";
    git.working = { tdd: "mine" };

    await expect(buildPromote(git).execute(skillRef("tdd"))).resolves.toEqual({
      ok: false,
      error: "concurrent-change",
    });
    expect(git.pushed).toEqual([]);
  });

  it("refuses to promote from a clone that is only behind a teammate's change", async () => {
    const git = new InMemoryHarnessGit();
    git.commit("mine", { tdd: "older" });
    git.commit("theirs", { tdd: "newer" }, { parent: "mine" });
    git.tip = "theirs";
    git.head = "mine";
    git.working = { tdd: "edited" };

    await expect(buildPromote(git).execute(skillRef("tdd"))).resolves.toEqual({
      ok: false,
      error: "concurrent-change",
    });
  });

  it("falls back to calling a difference concurrent when no merge base exists", async () => {
    // Unrelated histories: nothing tells the author's change from a teammate's.
    const git = new InMemoryHarnessGit();
    git.commit("theirs", { tdd: "theirs" });
    git.commit("mine", { tdd: "mine" });
    git.tip = "theirs";
    git.head = "mine";
    git.working = { tdd: "mine" };

    await expect(buildPromote(git).execute(skillRef("tdd"))).resolves.toEqual({
      ok: false,
      error: "concurrent-change",
    });
  });

  it("still pushes the author's own unpushed commit, never mistaking it for a teammate's", async () => {
    const git = new InMemoryHarnessGit();
    git.commit("head", { tdd: "old" });
    git.commit("mine", { tdd: "mine" }, { parent: "head" });
    git.tip = "head";
    git.head = "mine";
    git.working = { tdd: "mine" };

    await expect(
      buildPromote(git).execute(skillRef("tdd")),
    ).resolves.toMatchObject({
      ok: true,
    });
    expect(git.pushed.map((push) => push.base)).toEqual(["head"]);
  });

  it("never lets a teammate's change to a different skill block this promotion", async () => {
    // Only `jobs` moved on origin/HEAD since the fork, so `tdd` is ours (#579).
    const git = new InMemoryHarnessGit();
    git.commit("fork", { tdd: "same", jobs: "old" });
    git.commit("head", { tdd: "same", jobs: "theirs" }, { parent: "fork" });
    git.commit("mine", { tdd: "mine", jobs: "old" }, { parent: "fork" });
    git.tip = "head";
    git.head = "mine";
    git.working = { tdd: "mine", jobs: "old" };

    await expect(
      buildPromote(git).execute(skillRef("tdd")),
    ).resolves.toMatchObject({
      ok: true,
    });
    expect(git.pushed.map((push) => push.base)).toEqual(["head"]);
  });

  it("re-checks after its pre-push refetch, catching a teammate's push landing in between", async () => {
    // The first check passes; the teammate's push arrives with the second fetch (#579).
    const git = new InMemoryHarnessGit().settled({ tdd: "same" }, "head-1");
    git.working = { tdd: "mine" };
    git.arrivals.push(() => {});
    git.teammatePushes("head-2", { tdd: "theirs" });

    await expect(buildPromote(git).execute(skillRef("tdd"))).resolves.toEqual({
      ok: false,
      error: "concurrent-change",
    });
    expect(git.fetches).toBe(2);
    expect(git.pushed).toEqual([]);
  });

  it("builds the push on the tip its own pre-push refetch found, not the first check's", async () => {
    const git = new InMemoryHarnessGit().settled({ tdd: "same" }, "head-1");
    git.working = { tdd: "mine" };
    git.arrivals.push(() => {});
    git.teammatePushes("head-2", { tdd: "same", jobs: "theirs" });

    await expect(
      buildPromote(git).execute(skillRef("tdd")),
    ).resolves.toMatchObject({
      ok: true,
    });
    expect(git.pushed.map((push) => push.base)).toEqual(["head-2"]);
  });

  it("asks for the merge base against the exact commit each check just read, never a mutable ref", async () => {
    // One captured commit per read, never a shared ref a fetch could move (#579).
    const git = new InMemoryHarnessGit().settled({ tdd: "same" }, "head-1");
    git.working = { tdd: "mine" };
    git.arrivals.push(() => {});
    git.teammatePushes("head-2", { tdd: "same", jobs: "theirs" });

    await buildPromote(git).execute(skillRef("tdd"));

    expect(git.mergeBaseAsks).toEqual(["head-1", "head-2"]);
  });

  it("refuses a second promotion of the same harness while one is in flight", async () => {
    let release = () => {};
    const git = newSkillWorld();
    git.working = { tdd: "mine", jobs: "mine" };
    git.fetchHold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const promote = buildPromote(git);

    const first = promote.execute(skillRef("tdd"));
    const second = await promote.execute(skillRef("jobs"));
    release();

    expect(second).toEqual({ ok: false, error: "promote-in-progress" });
    await expect(first).resolves.toMatchObject({ ok: true });
  });

  it("fetches before the push even right after a read reused within its window", async () => {
    const git = newSkillWorld();
    const gate = readGate(git);
    await gate.fetch("/harness", READ_MAX_AGE_MS);

    await buildPromote(git, { fetchGate: gate }).execute(skillRef("tdd"));

    // The first check's fetch and the recheck's, never the read's.
    expect(git.fetches).toBe(3);
  });

  it("makes the next read fetch after the promotion is pushed, even within its window", async () => {
    const git = newSkillWorld();
    const gate = readGate(git);
    await gate.fetch("/harness", READ_MAX_AGE_MS);
    await expect(
      buildPromote(git, { fetchGate: gate }).execute(skillRef("tdd")),
    ).resolves.toMatchObject({ ok: true });

    await gate.fetch("/harness", READ_MAX_AGE_MS);

    expect(git.fetches).toBe(4);
  });
});
