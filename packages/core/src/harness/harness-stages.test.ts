import { describe, expect, it } from "vitest";
import type { GitOrigin } from "../deploy/git-origin";
import type { HarnessReviewRead, ReviewRequest } from "./harness-review-port";
import {
  buildStages,
  type HarnessStageRead,
  type HarnessStageRow,
  type StageInput,
} from "./harness-stages";
import type { HarnessSkillTrees } from "./read-harness-state";

const ORIGIN: GitOrigin = {
  host: "github.com",
  ownerRepo: "fimoklei/agent-harness",
};

// One promote branch: the tree under review, and the tip commit that carries
// it. A null tree is a branch proposing to delete its skill.
const onBranch = (tree: string | null) => ({ tree, commit: "branch-tip" });

// A skill whose content is the same everywhere, with no promote branch: the
// quiet case each test moves one hash away from.
const SETTLED: HarnessSkillTrees = {
  remote: { tdd: "same" },
  promote: {},
  local: { tdd: "same" },
  working: { tdd: "same" },
};

const EMPTY_READ: HarnessReviewRead = {
  outcome: "read",
  requests: [],
  complete: true,
  limit: 100,
};

const request = (over: Partial<ReviewRequest> = {}): ReviewRequest => ({
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

const reviewOf = (
  requests: ReviewRequest[],
  complete = true,
): HarnessReviewRead => ({ outcome: "read", requests, complete, limit: 100 });

const stages = (over: Partial<StageInput> = {}) =>
  buildStages({
    origin: ORIGIN,
    defaultBranch: "main",
    trees: SETTLED,
    atMergeBase: null,
    review: EMPTY_READ,
    release: [],
    ...over,
  });

const rowsOf = (stage: HarnessStageRead): HarnessStageRow[] =>
  stage.outcome === "read" ? stage.rows : [];

// The one row a case is about, asserted to exist so the expectation below it
// is never quietly skipped.
const oneRow = (stage: HarnessStageRead): HarnessStageRow => {
  const [row] = rowsOf(stage);
  if (row === undefined) {
    throw new Error("expected one row in this stage");
  }
  return row;
};

const statuses = (stage: HarnessStageRead) =>
  rowsOf(stage).map((row) => `${row.skill}:${row.status}`);

describe("Pending proposal membership", () => {
  it("reads a skill that is the same everywhere as nothing waiting", () => {
    expect(statuses(stages().proposal)).toEqual([]);
  });

  it("reads edited working content with no proposal as not yet proposed", () => {
    const trees = { ...SETTLED, working: { tdd: "edited" } };
    expect(statuses(stages({ trees }).proposal)).toEqual([
      "tdd:not-yet-proposed",
    ]);
  });

  it("reads a skill added on disk as not yet proposed", () => {
    const trees = {
      remote: {},
      promote: {},
      local: {},
      working: { tdd: "new" },
    };
    expect(statuses(stages({ trees }).proposal)).toEqual([
      "tdd:not-yet-proposed",
    ]);
  });

  // The fact that decides whether a deletion is proposed or made on disk: no
  // tree on origin/HEAD, none at local HEAD, and no proposal branch (#798).
  it("marks a skill that exists only in the working tree as local only", () => {
    const trees = {
      remote: {},
      promote: {},
      local: {},
      working: { tdd: "new" },
    };
    expect(oneRow(stages({ trees }).proposal).localOnly).toBe(true);
  });

  it.each([
    ["origin/HEAD holds it", { remote: { tdd: "remote" } }],
    ["local HEAD holds it", { local: { tdd: "local" } }],
    ["a proposal branch holds it", { promote: { tdd: onBranch("branch") } }],
  ])("never marks a skill local only when %s", (_what, over) => {
    const trees = {
      remote: {},
      promote: {},
      local: {},
      working: { tdd: "new" },
      ...over,
    };
    expect(oneRow(stages({ trees }).proposal).localOnly).toBe(false);
  });

  it("never presents a clone that is only behind as the author's own change", () => {
    const trees = {
      remote: { tdd: "newer" },
      promote: {},
      local: { tdd: "older" },
      working: { tdd: "older" },
    };
    expect(statuses(stages({ trees }).proposal)).toEqual([]);
  });

  it("never presents a skill this clone has not pulled yet as a deletion", () => {
    const trees = {
      remote: { tdd: "newer" },
      promote: {},
      local: {},
      working: {},
    };
    expect(statuses(stages({ trees }).proposal)).toEqual([]);
  });

  it("reads a skill deleted on disk as deleted locally", () => {
    const trees = { ...SETTLED, working: {} };
    const row = oneRow(stages({ trees }).proposal);
    expect(row.status).toBe("deleted-locally");
    expect(row.deletion).toBe(true);
  });

  it("reads a skill restored after a proposed deletion as work to send", () => {
    // The branch still proposes the deletion; the file is back on disk. That
    // is an update to the same proposal, not a deletion of its own (#847).
    const restored: HarnessSkillTrees = {
      remote: { tdd: "same" },
      promote: { tdd: onBranch(null) },
      local: { tdd: "same" },
      working: { tdd: "same" },
    };
    const row = oneRow(
      stages({ trees: restored, review: reviewOf([request()]) }).proposal,
    );
    expect(row.status).toBe("new-local-work");
    expect(row.deletion).toBe(false);
  });

  it("keeps local edits visible after a proposal, instead of hiding them behind it", () => {
    // The bug #518's exclusive classifier caused: the promote branch won and
    // the author's later edit vanished (user story 6).
    const trees = {
      remote: { tdd: "same" },
      promote: { tdd: onBranch("pushed") },
      local: { tdd: "same" },
      working: { tdd: "edited" },
    };
    expect(statuses(stages({ trees }).proposal)).toEqual([
      "tdd:new-local-work",
    ]);
  });

  it("reads a local reversion against a differing proposal as work to send", () => {
    const trees = {
      remote: { tdd: "same" },
      promote: { tdd: onBranch("pushed") },
      local: { tdd: "same" },
      working: { tdd: "same" },
    };
    expect(statuses(stages({ trees }).proposal)).toEqual([
      "tdd:new-local-work",
    ]);
  });

  it("holds a proposal that carries exactly the local content out of the stage", () => {
    const trees = {
      remote: { tdd: "same" },
      promote: { tdd: onBranch("pushed") },
      local: { tdd: "same" },
      working: { tdd: "pushed" },
    };
    expect(statuses(stages({ trees }).proposal)).toEqual([]);
  });

  it("keeps comparing against a branch whose request is still open", () => {
    // The branch's content reached origin/HEAD but GitHub still calls the
    // request open, so it is the proposal the local content is measured against.
    const trees = {
      remote: { tdd: "pushed" },
      promote: { tdd: onBranch("pushed") },
      local: { tdd: "pushed" },
      working: { tdd: "edited" },
    };
    expect(
      statuses(stages({ trees, review: reviewOf([request()]) }).proposal),
    ).toEqual(["tdd:new-local-work"]);
  });

  it("compares against the default branch again once the proposal has merged", () => {
    const trees = {
      remote: { tdd: "pushed" },
      promote: { tdd: onBranch("pushed") },
      local: { tdd: "pushed" },
      working: { tdd: "pushed" },
    };
    expect(statuses(stages({ trees }).proposal)).toEqual([]);
  });

  it("names the open request it compared the local content against", () => {
    const trees = {
      remote: { tdd: "same" },
      promote: { tdd: onBranch("pushed") },
      local: { tdd: "same" },
      working: { tdd: "edited" },
    };
    const row = oneRow(
      stages({ trees, review: reviewOf([request()]) }).proposal,
    );
    expect(row.comparison).toEqual({ kind: "proposal", number: 45 });
  });

  it("names the default branch when no proposal exists", () => {
    const trees = { ...SETTLED, working: { tdd: "edited" } };
    const row = oneRow(stages({ trees }).proposal);
    expect(row.comparison).toEqual({ kind: "default-branch" });
  });

  it("reads the local stage as unknown when the refs could not be read", () => {
    expect(stages({ trees: null }).proposal.outcome).toBe("unknown");
  });
});

describe("Pending review membership", () => {
  const pushed: HarnessSkillTrees = {
    remote: { tdd: "same" },
    promote: { tdd: onBranch("pushed") },
    local: { tdd: "same" },
    working: { tdd: "pushed" },
  };

  it("reads a pushed branch with no matching request as pull request missing", () => {
    expect(statuses(stages({ trees: pushed }).review)).toEqual([
      "tdd:pull-request-missing",
    ]);
  });

  it("reads a matching open request as waiting for review", () => {
    const review = reviewOf([request()]);
    expect(statuses(stages({ trees: pushed, review }).review)).toEqual([
      "tdd:waiting-for-review",
    ]);
  });

  it("carries the request's durable URL on the row", () => {
    const review = reviewOf([request()]);
    const row = oneRow(stages({ trees: pushed, review }).review);
    expect(row.requests).toEqual([
      { number: 45, url: "https://github.com/fimoklei/agent-harness/pull/45" },
    ]);
  });

  it("puts a draft ahead of a requested change", () => {
    const review = reviewOf([
      request({ draft: true, decision: "changes-requested" }),
    ]);
    expect(statuses(stages({ trees: pushed, review }).review)).toEqual([
      "tdd:draft",
    ]);
  });

  it("reads GitHub's requested changes when the request is not a draft", () => {
    const review = reviewOf([request({ decision: "changes-requested" })]);
    expect(statuses(stages({ trees: pushed, review }).review)).toEqual([
      "tdd:changes-requested",
    ]);
  });

  it("keeps an approved request pending review until it merges", () => {
    const review = reviewOf([request({ decision: "approved" })]);
    expect(statuses(stages({ trees: pushed, review }).review)).toEqual([
      "tdd:approved-awaiting-merge",
    ]);
  });

  it("carries every requested reviewer, uncapped", () => {
    const review = reviewOf([
      request({
        reviewers: [
          { kind: "user", login: "ada" },
          { kind: "user", login: "bo" },
          { kind: "team", slug: "fimoklei/reviewers" },
        ],
      }),
    ]);
    const row = oneRow(stages({ trees: pushed, review }).review);
    expect(row.reviewers).toHaveLength(3);
  });

  it("reads a merged request as proposal merged, never as missing", () => {
    const review = reviewOf([request({ state: "merged" })]);
    expect(statuses(stages({ trees: pushed, review }).review)).toEqual([
      "tdd:proposal-merged",
    ]);
  });

  it("links the merged request the row states", () => {
    const review = reviewOf([request({ state: "merged" })]);
    const row = oneRow(stages({ trees: pushed, review }).review);
    expect(row.requests).toEqual([
      {
        number: 45,
        url: "https://github.com/fimoklei/agent-harness/pull/45",
      },
    ]);
  });

  it("drops the row once the merge reaches the default branch", () => {
    const merged: HarnessSkillTrees = {
      remote: { tdd: "pushed" },
      promote: { tdd: onBranch("pushed") },
      local: { tdd: "same" },
      working: { tdd: "pushed" },
    };
    const review = reviewOf([request({ state: "merged" })]);
    expect(statuses(stages({ trees: merged, review }).review)).toEqual([]);
  });

  it("prefers an open request over a merged one on the same branch", () => {
    const review = reviewOf([
      request({ number: 44, state: "merged" }),
      request({ number: 45, state: "open" }),
    ]);
    expect(statuses(stages({ trees: pushed, review }).review)).toEqual([
      "tdd:waiting-for-review",
    ]);
  });

  it("never matches a request opened from another repository's branch", () => {
    const review = reviewOf([request({ headOwner: "someone-else" })]);
    expect(statuses(stages({ trees: pushed, review }).review)).toEqual([
      "tdd:pull-request-missing",
    ]);
  });

  it("never matches a request aimed at another base branch", () => {
    const review = reviewOf([request({ baseBranch: "release" })]);
    expect(statuses(stages({ trees: pushed, review }).review)).toEqual([
      "tdd:pull-request-missing",
    ]);
  });

  it("never matches a request whose head repository is gone", () => {
    const review = reviewOf([request({ headOwner: null, headRepo: null })]);
    expect(statuses(stages({ trees: pushed, review }).review)).toEqual([
      "tdd:pull-request-missing",
    ]);
  });

  // The claim #843 made here — a merged request is never an open one — kept,
  // over the reading that replaced it.
  it("never lets a merged request stand in for an open one", () => {
    const review = reviewOf([request({ state: "merged", number: 12 })]);
    const row = oneRow(stages({ trees: pushed, review }).review);
    expect(row.status).toBe("proposal-merged");
    expect(row.reviewers).toEqual([]);
  });

  it("reads a closed request over unincorporated content as proposal closed", () => {
    const review = reviewOf([request({ state: "closed" })]);
    expect(statuses(stages({ trees: pushed, review }).review)).toEqual([
      "tdd:proposal-closed",
    ]);
  });

  it("holds a closed request whose content already merged out of the stage", () => {
    const merged: HarnessSkillTrees = {
      remote: { tdd: "pushed" },
      promote: { tdd: onBranch("pushed") },
      local: { tdd: "pushed" },
      working: { tdd: "pushed" },
    };
    const review = reviewOf([request({ state: "closed" })]);
    expect(statuses(stages({ trees: merged, review }).review)).toEqual([]);
  });

  it("exposes every matching open request instead of picking one", () => {
    const review = reviewOf([
      request({
        number: 41,
        url: "https://github.com/fimoklei/agent-harness/pull/41",
      }),
      request({
        number: 44,
        url: "https://github.com/fimoklei/agent-harness/pull/44",
      }),
    ]);
    const row = oneRow(stages({ trees: pushed, review }).review);
    expect(row.status).toBe("multiple-pull-requests");
    expect(row.requests.map((each) => each.number)).toEqual([41, 44]);
  });

  it("keeps a branch that proposes a deletion as a deletion in its own stage", () => {
    const deleting: HarnessSkillTrees = {
      remote: { tdd: "same" },
      promote: { tdd: onBranch(null) },
      local: { tdd: "same" },
      working: {},
    };
    const review = reviewOf([request()]);
    const row = oneRow(stages({ trees: deleting, review }).review);
    expect(row.deletion).toBe(true);
  });

  it("keeps the deletion fact under every reading a review can take", () => {
    const deleting: HarnessSkillTrees = {
      remote: { tdd: "same" },
      promote: { tdd: onBranch(null) },
      local: { tdd: "same" },
      working: {},
    };
    const readings: [ReviewRequest[], string][] = [
      [[request({ draft: true })], "draft"],
      [[request()], "waiting-for-review"],
      [[request({ decision: "changes-requested" })], "changes-requested"],
      [[request({ decision: "approved" })], "approved-awaiting-merge"],
      [[request({ state: "closed" })], "proposal-closed"],
      [[], "pull-request-missing"],
      [
        [request({ number: 41 }), request({ number: 44 })],
        "multiple-pull-requests",
      ],
    ];
    for (const [requests, status] of readings) {
      const row = oneRow(
        stages({ trees: deleting, review: reviewOf(requests) }).review,
      );
      expect(row.status).toBe(status);
      expect(row.deletion, status).toBe(true);
    }
  });

  it("never claims a request is missing when the read filled its bound", () => {
    const review = reviewOf([], false);
    expect(statuses(stages({ trees: pushed, review }).review)).toEqual([]);
  });

  it("names the bound a review read filled", () => {
    const stage = stages({ trees: pushed, review: reviewOf([], false) }).review;
    expect(stage).toMatchObject({ outcome: "read", bound: 100 });
  });

  it("reads a failed review check as unknown, never as an empty stage", () => {
    expect(stages({ review: { outcome: "failed" } }).review.outcome).toBe(
      "unknown",
    );
  });

  it("reads an unavailable review capability as its own outcome", () => {
    expect(stages({ review: { outcome: "unavailable" } }).review.outcome).toBe(
      "unavailable",
    );
  });

  it("leaves the local stages readable when the review check fails", () => {
    const trees = { ...SETTLED, working: { tdd: "edited" } };
    const built = stages({ trees, review: { outcome: "failed" } });
    expect(statuses(built.proposal)).toEqual(["tdd:not-yet-proposed"]);
    expect(built.release.outcome).toBe("read");
  });
});

describe("A spent proposal branch", () => {
  const TIP = "9f1c0b2a4d6e8f0a1b3c5d7e9f0a1b2c3d4e5f60";

  // A branch whose content still differs from origin/HEAD, so only a merged
  // request over its tip can end the proposal.
  const ahead: HarnessSkillTrees = {
    remote: { tdd: "same" },
    promote: { tdd: { tree: "pushed", commit: TIP } },
    local: { tdd: "same" },
    working: { tdd: "same" },
  };
  const mergedAtTip = reviewOf([request({ state: "merged", headCommit: TIP })]);

  it("counts a branch whose tip merged in no stage", () => {
    const built = stages({ trees: ahead, review: mergedAtTip });
    expect(statuses(built.proposal)).toEqual([]);
    expect(statuses(built.review)).toEqual([]);
  });

  it("judges the skill against the default branch as if the branch were gone", () => {
    const trees = { ...ahead, working: { tdd: "edited" } };
    const row = oneRow(stages({ trees, review: mergedAtTip }).proposal);
    expect(row.status).toBe("not-yet-proposed");
    expect(row.comparison).toEqual({ kind: "default-branch" });
  });

  it("keeps a merged request over another commit as it reads today", () => {
    const review = reviewOf([request({ state: "merged" })]);
    expect(statuses(stages({ trees: ahead, review }).review)).toEqual([
      "tdd:proposal-merged",
    ]);
  });

  it("never lets a read that filled its bound prove a branch spent", () => {
    const review = reviewOf(
      [request({ state: "merged", headCommit: TIP })],
      false,
    );
    expect(statuses(stages({ trees: ahead, review }).review)).toEqual([
      "tdd:proposal-merged",
    ]);
  });

  it("keeps the branch a proposal when the review read failed", () => {
    const trees = { ...ahead, working: { tdd: "edited" } };
    const built = stages({ trees, review: { outcome: "failed" } });
    expect(statuses(built.proposal)).toEqual(["tdd:new-local-work"]);
  });

  it("keeps the branch a proposal when review reads are unavailable", () => {
    const trees = { ...ahead, working: { tdd: "edited" } };
    const built = stages({ trees, review: { outcome: "unavailable" } });
    expect(statuses(built.proposal)).toEqual(["tdd:new-local-work"]);
  });

  it("keeps a branch with an open request pending review", () => {
    const review = reviewOf([
      request({ number: 44, state: "merged", headCommit: TIP }),
      request({ number: 45, state: "open" }),
    ]);
    expect(statuses(stages({ trees: ahead, review }).review)).toEqual([
      "tdd:waiting-for-review",
    ]);
  });

  it("judges a branch reused for several merged requests by its tip", () => {
    const review = reviewOf([
      request({
        number: 44,
        state: "merged",
        headCommit: "1111111111111111111111111111111111111111",
      }),
      request({ number: 45, state: "merged", headCommit: TIP }),
    ]);
    expect(statuses(stages({ trees: ahead, review }).review)).toEqual([]);
  });

  it("never reads a ref it could not read as spent", () => {
    const trees = {
      ...ahead,
      promote: { tdd: { tree: "pushed", commit: null } },
    };
    expect(statuses(stages({ trees, review: mergedAtTip }).review)).toEqual([
      "tdd:proposal-merged",
    ]);
  });
});

describe("Pending release membership", () => {
  it("reads the merged delta as green release rows", () => {
    const built = stages({
      release: [
        { kind: "added", name: "tdd" },
        { kind: "removed", name: "old" },
      ],
    });
    expect(statuses(built.release)).toEqual(["tdd:added", "old:deleted"]);
  });

  it("carries the name a renamed skill moved from", () => {
    const built = stages({
      release: [{ kind: "renamed", name: "tdd", previousName: "testing" }],
    });
    expect(oneRow(built.release).previousName).toBe("testing");
  });

  it("reads an uncomputable delta as unknown, never as an empty stage", () => {
    expect(stages({ release: null }).release.outcome).toBe("unknown");
  });
});

describe("stage memberships are independent", () => {
  // One skill with three different pieces of work: a merged change waiting for
  // release, an open proposal, and a further local edit (user story 9).
  const busy = () =>
    stages({
      trees: {
        remote: { tdd: "merged" },
        promote: { tdd: onBranch("pushed") },
        local: { tdd: "merged" },
        working: { tdd: "edited" },
      },
      review: reviewOf([request()]),
      release: [{ kind: "changed", name: "tdd" }],
    });

  it("gives one skill a row in every stage it belongs to", () => {
    const built = busy();
    expect(statuses(built.proposal)).toEqual(["tdd:new-local-work"]);
    expect(statuses(built.review)).toEqual(["tdd:waiting-for-review"]);
    expect(statuses(built.release)).toEqual(["tdd:changed"]);
  });

  it("names the other stages a row's skill occupies, in journey order", () => {
    expect(oneRow(busy().proposal).alsoIn).toEqual([
      "pending-review",
      "pending-release",
    ]);
  });

  it("names no other stage for a skill that sits in one alone", () => {
    const trees = { ...SETTLED, working: { tdd: "edited" } };
    expect(oneRow(stages({ trees }).proposal).alsoIn).toEqual([]);
  });

  it("suppresses the cross-stage line when a stage could not be read", () => {
    const trees = { ...SETTLED, working: { tdd: "edited" } };
    const built = stages({ trees, review: { outcome: "unavailable" } });
    expect(oneRow(built.proposal).alsoIn).toBeNull();
  });

  it("suppresses the cross-stage line when a bounded read found no request", () => {
    const trees = { ...SETTLED, working: { tdd: "edited" } };
    const built = stages({ trees, review: reviewOf([], false) });
    expect(oneRow(built.proposal).alsoIn).toBeNull();
  });

  it("never lets a local deletion relabel the same skill's earlier change", () => {
    const built = stages({
      trees: {
        remote: { tdd: "merged" },
        promote: {},
        local: { tdd: "merged" },
        working: {},
      },
      release: [{ kind: "changed", name: "tdd" }],
    });
    expect(oneRow(built.proposal).deletion).toBe(true);
    expect(oneRow(built.release).deletion).toBe(false);
    expect(oneRow(built.release).status).toBe("changed");
  });
});
