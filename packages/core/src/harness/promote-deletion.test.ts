import { describe, expect, it } from "vitest";
import { InFlightLocks } from "../deploy/in-flight-locks";
import { InMemoryHarnessGit, treeHash } from "./harness-git.fake";
import type {
  HarnessReviewRead,
  NewReviewRequest,
  ReviewRequest,
  ReviewWriteOutcome,
} from "./harness-review-port";
import { PromoteSkillDeletion } from "./promote-deletion";
import type { HarnessFreshness } from "./read-harness-state";

const AT = new Date("2026-08-09T12:00:00.000Z");

const FRESHNESS: HarnessFreshness = {
  outcome: "fetched",
  lastFetchedAt: "2026-08-01T07:00:00.000Z",
};

const TDD = "---\ndescription: Test first.\n---\n";

// `seen` is the origin/HEAD tree the row showed the author.
const SEEN = treeHash(TDD);

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

// `tdd` is on origin/HEAD and local HEAD, and the author deleted its folder.
const deletedWorld = () => {
  const git = new InMemoryHarnessGit().settled({ tdd: TDD }, "head");
  git.working = {};
  return git;
};

function buildDeletion(
  git: InMemoryHarnessGit,
  overrides?: {
    root?: string | undefined;
    review?: HarnessReviewRead;
    onCreate?: (request: NewReviewRequest) => void;
    onEdit?: (number: number, title: string) => void;
    editOutcome?: ReviewWriteOutcome;
  },
) {
  return new PromoteSkillDeletion({
    resolveRoot: async () =>
      overrides && "root" in overrides ? overrides.root : "/harness",
    locks: new InFlightLocks(),
    git,
    freshness: {
      read: async () => FRESHNESS,
      record: async () => {},
    },
    review: {
      readReviews: async () => overrides?.review ?? EMPTY_REVIEW,
      readViewer: async () => ({ outcome: "read", login: "fimoklei" }),
      createRequest: async (_origin, made) => {
        overrides?.onCreate?.(made);
        return { ok: true };
      },
      reopenRequest: async () => ({ ok: true }),
      closeRequest: async () => ({ ok: true }),
      editRequest: async (_origin, number, { title }) => {
        overrides?.onEdit?.(number, title);
        return overrides?.editOutcome ?? { ok: true };
      },
    },
  });
}

describe("PromoteSkillDeletion", () => {
  it("opens the pull request the pushed removal has no proposal for", async () => {
    const created: NewReviewRequest[] = [];
    const deletion = buildDeletion(deletedWorld(), {
      onCreate: (made) => created.push(made),
    });

    await expect(deletion.execute("tdd", SEEN, AT)).resolves.toMatchObject({
      ok: true,
    });
    expect(created).toEqual([
      {
        head: "maestro/tdd",
        base: "main",
        title: "Delete skill: tdd",
        body: "Deletes tdd from the Harness. Targets keep the skill until each one runs Update target after the next release.",
      },
    ]);
  });

  it("leaves an open proposal's request alone when the removal updates it", async () => {
    const created: NewReviewRequest[] = [];
    const deletion = buildDeletion(deletedWorld(), {
      review: { ...EMPTY_REVIEW, requests: [openRequest()] },
      onCreate: (made) => created.push(made),
    });

    await expect(deletion.execute("tdd", SEEN, AT)).resolves.toMatchObject({
      ok: true,
    });
    expect(created).toEqual([]);
  });

  it("retitles an open change request as the deletion it now carries", async () => {
    const edited: [number, string][] = [];
    const deletion = buildDeletion(deletedWorld(), {
      review: {
        ...EMPTY_REVIEW,
        requests: [openRequest({ title: "Promote skill: tdd (v2)" })],
      },
      onEdit: (number, title) => edited.push([number, title]),
    });

    await expect(deletion.execute("tdd", SEEN, AT)).resolves.toMatchObject({
      ok: true,
    });
    expect(edited).toEqual([[45, "Delete skill: tdd"]]);
  });

  it("still reports the pushed deletion when the retitle fails", async () => {
    const deletion = buildDeletion(deletedWorld(), {
      review: { ...EMPTY_REVIEW, requests: [openRequest()] },
      editOutcome: { ok: false, error: "failed" },
    });

    await expect(deletion.execute("tdd", SEEN, AT)).resolves.toMatchObject({
      ok: true,
      branch: "maestro/tdd",
    });
  });

  it("refuses while another contributor's request is open on the branch", async () => {
    const git = deletedWorld();
    const deletion = buildDeletion(git, {
      review: {
        ...EMPTY_REVIEW,
        requests: [openRequest({ author: "teammate" })],
      },
    });

    await expect(deletion.execute("tdd", SEEN, AT)).resolves.toEqual({
      ok: false,
      error: "proposed-by-other",
    });
    expect(git.pushed).toEqual([]);
  });

  it("refuses while more than one open request matches the branch", async () => {
    const git = deletedWorld();
    const deletion = buildDeletion(git, {
      review: {
        ...EMPTY_REVIEW,
        requests: [openRequest({ number: 41 }), openRequest({ number: 44 })],
      },
    });

    await expect(deletion.execute("tdd", SEEN, AT)).resolves.toEqual({
      ok: false,
      error: "extra-requests",
    });
    expect(git.pushed).toEqual([]);
  });

  it("pushes the removal and answers with the branch and its pull-request page", async () => {
    const git = deletedWorld();

    await expect(buildDeletion(git).execute("tdd", SEEN, AT)).resolves.toEqual({
      ok: true,
      branch: "maestro/tdd",
      pullRequestUrl:
        "https://github.com/fimoklei/agent-harness/compare/main...maestro/tdd?expand=1",
    });
    expect(git.pushed).toEqual([
      { name: "tdd", base: "head", kind: "deletion" },
    ]);
  });

  it("builds the removal on the fetched tip, never local HEAD, so local commits never ride along", async () => {
    const git = deletedWorld();
    git.commit("local", { tdd: TDD, jobs: "unpushed" }, { parent: "head" });
    git.head = "local";
    git.working = { jobs: "unpushed" };

    await expect(
      buildDeletion(git).execute("tdd", SEEN, AT),
    ).resolves.toMatchObject({ ok: true });
    expect(git.pushed.map((push) => push.base)).toEqual(["head"]);
  });

  it("refuses a confirmation whose seen origin/HEAD tree has since moved", async () => {
    // A teammate's change to this skill merged after the row was painted.
    const git = deletedWorld();
    git.teammatePushes("theirs", { tdd: "theirs" });

    await expect(buildDeletion(git).execute("tdd", SEEN, AT)).resolves.toEqual({
      ok: false,
      error: "confirmation-stale",
    });
    expect(git.pushed).toEqual([]);
  });

  it("refuses a skill origin/HEAD no longer carries, so a removal is never pushed twice", async () => {
    const git = deletedWorld();
    git.teammatePushes("gone", {});

    await expect(buildDeletion(git).execute("tdd", SEEN, AT)).resolves.toEqual({
      ok: false,
      error: "confirmation-stale",
    });
  });

  it("refuses a skill that is still on disk, which is an edit and not a removal", async () => {
    const git = deletedWorld();
    git.working = { tdd: "on-disk" };

    await expect(buildDeletion(git).execute("tdd", SEEN, AT)).resolves.toEqual({
      ok: false,
      error: "not-deleted",
    });
    expect(git.pushed).toEqual([]);
  });

  it("refuses a skill local HEAD never tracked, so an untracked name is no deletion", async () => {
    const git = deletedWorld();
    git.commit("local", {});
    git.head = "local";

    await expect(buildDeletion(git).execute("tdd", SEEN, AT)).resolves.toEqual({
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
    const git = deletedWorld();
    git.ambiguity = why;

    await expect(buildDeletion(git).execute("tdd", SEEN, AT)).resolves.toEqual({
      ok: false,
      error: why,
    });
    expect(git.pushed).toEqual([]);
  });

  it("reports a harness that is not connected", async () => {
    await expect(
      buildDeletion(deletedWorld(), { root: undefined }).execute(
        "tdd",
        SEEN,
        AT,
      ),
    ).resolves.toEqual({ ok: false, error: "not-configured" });
  });

  it("refuses a name that is not a skill before it reaches the harness", async () => {
    const git = deletedWorld();

    await expect(
      buildDeletion(git).execute("../etc", SEEN, AT),
    ).resolves.toEqual({ ok: false, error: "invalid-skill" });
    expect(git.fetches).toBe(0);
  });

  it("refuses an origin no pull request can be opened against", async () => {
    const git = deletedWorld();
    git.originUrl = null;

    await expect(buildDeletion(git).execute("tdd", SEEN, AT)).resolves.toEqual({
      ok: false,
      error: "no-usable-origin",
    });
  });

  it("refuses when the fetch got no answer, so nothing is removed from a stale tip", async () => {
    const git = deletedWorld();
    git.fetchOutcomes = ["offline"];

    await expect(buildDeletion(git).execute("tdd", SEEN, AT)).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
    expect(git.pushed).toEqual([]);
  });

  // Every push failure leaves the clone as it was, so a retry is safe (#577).
  it.each([
    ["push-elsewhere", "push-elsewhere"],
    ["source-changed", "source-changed"],
    ["offline", "no-answer"],
    ["push-failed", "promote-failed"],
  ] as const)("answers a %s push as %s", async (outcome, error) => {
    const git = deletedWorld();
    git.pushOutcome = outcome;

    await expect(buildDeletion(git).execute("tdd", SEEN, AT)).resolves.toEqual({
      ok: false,
      error,
    });
  });
});
