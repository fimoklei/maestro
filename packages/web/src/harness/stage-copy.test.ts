import { describe, expect, it } from "vitest";
import {
  alsoInWords,
  crossStageLine,
  deployedCopiesLine,
  detailSentence,
  PROPOSAL_EMPTY,
  PULL_REQUEST_CARD,
  pullRequestLinkName,
  pullRequestState,
  requestedReviewers,
  reviewerLine,
  reviewWord,
  statusReading,
} from "./stage-copy";
import { pullRequest } from "./stage-row-fixture";
import type { HarnessStage, HarnessStageRow, StageStatus } from "./use-harness";

const row = (
  stage: HarnessStage,
  status: StageStatus,
  over: Partial<HarnessStageRow> = {},
): HarnessStageRow => ({
  stage,
  skill: "tdd",
  status,
  deletion: false,
  requests: [],
  reviewers: [],
  comparison: null,
  alsoIn: [],
  concurrentChange: false,
  localOnly: false,
  remoteTree: null,
  restorable: false,
  previousName: null,
  ...over,
});

const ALL_STATUSES: StageStatus[] = [
  "not-yet-proposed",
  "new-local-work",
  "deleted-locally",
  "draft",
  "waiting-for-review",
  "changes-requested",
  "approved-awaiting-merge",
  "pull-request-missing",
  "proposal-merged",
  "proposal-closed",
  "multiple-pull-requests",
  "added",
  "changed",
  "renamed",
  "deleted",
];

const CONTEXT = { defaultBranch: "main", releasedVersion: "v1.4.0" };
const request = pullRequest(45);

describe("the Pending proposal empty state", () => {
  it("states a confirmed empty journey", () => {
    expect(PROPOSAL_EMPTY.journey).toEqual({
      title: "No changes yet",
      body: "Skills you import or edit in your clone will appear here.",
    });
  });

  it("names Import skill… exactly as the button reads", () => {
    expect(PROPOSAL_EMPTY.stage).toEqual({
      title: "No changes to propose yet",
      body: "Changes you make in your clone appear here. Select Import skill… to bring one in.",
    });
  });
});

// Five families, word first (#994): the reading survives without colour.
describe("status readings", () => {
  it("leaves every expected reading neutral", () => {
    for (const [stage, status] of [
      ["pending-proposal", "not-yet-proposed"],
      ["pending-proposal", "new-local-work"],
      ["pending-proposal", "deleted-locally"],
      ["pending-review", "draft"],
      ["pending-review", "waiting-for-review"],
      ["pending-review", "proposal-merged"],
      ["pending-release", "added"],
      ["pending-release", "changed"],
      ["pending-release", "renamed"],
      ["pending-release", "deleted"],
    ] as [HarnessStage, StageStatus][]) {
      expect(statusReading(row(stage, status)).family).toBe("neutral");
    }
  });

  it("never gives a stage reading the failed or unknown family", () => {
    // A failed press is a notice, and unknown sits on a group header (#994).
    for (const status of ALL_STATUSES) {
      expect(["neutral", "attention", "good"]).toContain(
        statusReading(row("pending-review", status)).family,
      );
    }
  });

  it("marks the four stuck Pending review readings for attention with ⚠", () => {
    for (const status of [
      "changes-requested",
      "pull-request-missing",
      "proposal-closed",
      "multiple-pull-requests",
    ] as const) {
      expect(statusReading(row("pending-review", status))).toMatchObject({
        family: "attention",
        glyph: "⚠",
      });
    }
  });

  it("reads an approved proposal as good", () => {
    expect(
      statusReading(row("pending-review", "approved-awaiting-merge")),
    ).toMatchObject({ family: "good", glyph: "✓" });
  });

  it("carries every reading as its word", () => {
    const readings: [StageStatus, string][] = [
      ["not-yet-proposed", "Not yet proposed"],
      ["new-local-work", "New local work"],
      ["deleted-locally", "Deleted locally"],
      ["waiting-for-review", "Waiting for review"],
      ["draft", "Draft"],
      ["changes-requested", "Changes requested"],
      ["approved-awaiting-merge", "Approved, awaiting merge"],
      ["pull-request-missing", "Pull request missing"],
      ["proposal-merged", "Proposal merged"],
      ["proposal-closed", "Proposal closed"],
      ["multiple-pull-requests", "Multiple pull requests"],
      ["added", "Added"],
      ["changed", "Changed"],
      ["renamed", "Renamed"],
      ["deleted", "Deleted"],
    ];
    for (const [status, word] of readings) {
      expect(statusReading(row("pending-review", status)).word).toBe(word);
    }
  });

  it("gives a deletion one reading in each stage of the journey", () => {
    // The six readings of #847, each in the stage that carries it.
    const six: [HarnessStage, StageStatus, string][] = [
      ["pending-proposal", "deleted-locally", "Deleted locally"],
      ["pending-review", "draft", "Deletion in draft"],
      ["pending-review", "waiting-for-review", "Deletion waiting for review"],
      ["pending-review", "changes-requested", "Deletion changes requested"],
      [
        "pending-review",
        "approved-awaiting-merge",
        "Deletion approved, awaiting merge",
      ],
      ["pending-release", "deleted", "Deleted"],
      ["pending-review", "proposal-merged", "Deletion merged"],
    ];
    for (const [stage, status, word] of six) {
      expect(statusReading(row(stage, status, { deletion: true })).word).toBe(
        word,
      );
    }
  });

  it("keeps a deletion's family with its status", () => {
    expect(
      statusReading(
        row("pending-review", "changes-requested", { deletion: true }),
      ),
    ).toEqual({
      word: "Deletion changes requested",
      family: "attention",
      glyph: "⚠",
    });
  });
});

describe("Detail sentences", () => {
  // Cause first, then `Select {control} to {result}` naming the row's own
  // control (#838). A status with no cockpit control names the place instead.
  const approved: [StageStatus, boolean, string][] = [
    [
      "not-yet-proposed",
      false,
      "Your local copy differs from main. Select Propose change to send it for review.",
    ],
    [
      "not-yet-proposed",
      true,
      "This skill is deleted in your clone but still on main. Select Propose change to propose the deletion.",
    ],
    [
      "deleted-locally",
      true,
      "This skill is deleted in your clone but still on main. Select Propose change to propose the deletion.",
    ],
    [
      "new-local-work",
      false,
      "You edited this skill after pull request #45. Select Update proposal to send the edits.",
    ],
    [
      "draft",
      false,
      "Pull request #45 is a draft. Select View pull request to mark it ready for review.",
    ],
    [
      "draft",
      true,
      "Pull request #45 proposes deleting this skill and is still a draft. Select View pull request to mark it ready for review.",
    ],
    [
      "waiting-for-review",
      false,
      "Pull request #45 is open and waiting for a reviewer.",
    ],
    [
      "waiting-for-review",
      true,
      "Pull request #45 proposes deleting this skill and is waiting for a reviewer.",
    ],
    [
      "changes-requested",
      false,
      "A reviewer asked for changes on pull request #45. Select Update proposal to send your changes.",
    ],
    [
      "changes-requested",
      true,
      "A reviewer asked for changes on the deletion in pull request #45. Select Update proposal to send your changes.",
    ],
    [
      "approved-awaiting-merge",
      false,
      "Pull request #45 is approved. Select View pull request to merge it.",
    ],
    [
      "approved-awaiting-merge",
      true,
      "Pull request #45 proposes deleting this skill and is approved. Select View pull request to merge it.",
    ],
    [
      "pull-request-missing",
      false,
      "The proposal branch is on GitHub without a pull request. Select Create pull request to open one.",
    ],
    [
      "proposal-merged",
      false,
      "Pull request #45 was merged. Select Re-read Harness to read GitHub again.",
    ],
    [
      "proposal-merged",
      true,
      "Pull request #45 merged the deletion. Select Re-read Harness to read GitHub again.",
    ],
    [
      "proposal-closed",
      false,
      "Pull request #45 was closed without merging. Select Reopen proposal to continue it.",
    ],
    [
      "added",
      false,
      "This skill was added to main after release v1.4.0. Select Create a release to publish it.",
    ],
    [
      "changed",
      false,
      "This skill changed on main after release v1.4.0. Select Create a release to publish it.",
    ],
    [
      "renamed",
      false,
      "This skill was renamed from testing on main. Select Create a release to publish it.",
    ],
    [
      "deleted",
      false,
      "This skill was deleted from main after release v1.4.0. Select Create a release to publish the deletion.",
    ],
  ];

  it.each(approved)(
    "states the approved sentence for %s (deletion: %s)",
    (status, deletion, sentence) => {
      expect(
        detailSentence(
          row("pending-review", status, {
            requests: [request],
            deletion,
            previousName: "testing",
          }),
          CONTEXT,
        ),
      ).toBe(sentence);
    },
  );

  // Two ways on where the folder can come back, so the one sentence names
  // both controls rather than hiding the local one (#915).
  it.each(["not-yet-proposed", "deleted-locally"] as const)(
    "names Restore skill beside Propose change on a restorable %s row",
    (status) => {
      expect(
        detailSentence(
          row("pending-proposal", status, {
            deletion: true,
            restorable: true,
          }),
          CONTEXT,
        ),
      ).toBe(
        "This skill is deleted in your clone but still on main. Select Propose change to propose the deletion, or Restore skill to bring it back.",
      );
    },
  );

  it("names the next step when nothing is released yet", () => {
    const unreleased = { defaultBranch: "main", releasedVersion: null };
    expect(detailSentence(row("pending-release", "added"), unreleased)).toBe(
      "This skill is on main and in no release yet. Select Create a release to publish it.",
    );
    expect(detailSentence(row("pending-release", "deleted"), unreleased)).toBe(
      "This skill is no longer on main. Select Create a release to publish the deletion.",
    );
    expect(detailSentence(row("pending-release", "renamed"), unreleased)).toBe(
      "This skill was renamed on main. Select Create a release to publish it.",
    );
  });

  it("names the prepared proposal when new local work has no request yet", () => {
    expect(
      detailSentence(row("pending-proposal", "new-local-work"), CONTEXT),
    ).toBe(
      "You edited this skill after preparing its proposal. Select Update proposal to send the edits.",
    );
  });

  it("states the approved sentence for two matching requests", () => {
    expect(
      detailSentence(
        row("pending-review", "multiple-pull-requests", {
          requests: [pullRequest(41), pullRequest(44)],
        }),
        CONTEXT,
      ),
    ).toBe(
      "Pull requests #41 and #44 both match this branch. Open the extra pull requests on GitHub and close them.",
    );
  });

  // The numbers grow without bound, so listing them past two would grow the
  // sentence past the length #840 settled. Every link stays in the row menu.
  it("keeps the sentence one length for three matching requests or more", () => {
    expect(
      detailSentence(
        row("pending-review", "multiple-pull-requests", {
          requests: [pullRequest(41), pullRequest(44), pullRequest(47)],
        }),
        CONTEXT,
      ),
    ).toBe(
      "Several pull requests match this branch. Open the extra pull requests on GitHub and close them.",
    );
  });

  it("names the branch it compared against when no proposal exists", () => {
    expect(
      detailSentence(row("pending-proposal", "not-yet-proposed"), CONTEXT),
    ).toContain("main");
  });

  it("keeps every sentence within two sentences of fifteen words", () => {
    const statuses = [
      "not-yet-proposed",
      "new-local-work",
      "deleted-locally",
      "draft",
      "waiting-for-review",
      "changes-requested",
      "approved-awaiting-merge",
      "pull-request-missing",
      "proposal-merged",
      "proposal-closed",
      "added",
      "changed",
      "renamed",
      "deleted",
    ] as const;
    for (const status of statuses) {
      for (const deletion of [false, true]) {
        const sentence = detailSentence(
          row("pending-review", status, {
            requests: [request],
            deletion,
            previousName: "testing",
          }),
          CONTEXT,
        );
        const clauses = sentence.split(". ").filter((part) => part !== "");
        expect(clauses.length, sentence).toBeLessThanOrEqual(2);
        for (const clause of clauses) {
          expect(clause.split(" ").length, clause).toBeLessThanOrEqual(15);
        }
        // F1: every sentence starts capitalised.
        expect(sentence[0], sentence).toBe(sentence[0]?.toUpperCase());
      }
    }
  });
});

describe("the reviewer and cross-stage lines", () => {
  it("names every requested reviewer, users and teams alike", () => {
    expect(
      reviewerLine(
        row("pending-review", "waiting-for-review", {
          reviewers: [
            { kind: "user", login: "ada" },
            { kind: "team", slug: "fimoklei/reviewers" },
          ],
        }),
      ),
    ).toBe("Review requested from @ada, @fimoklei/reviewers");
  });

  it("omits the reviewer line when nobody is requested", () => {
    expect(
      reviewerLine(row("pending-review", "waiting-for-review")),
    ).toBeNull();
  });

  it("names the applicable stages", () => {
    expect(
      crossStageLine(
        row("pending-proposal", "new-local-work", {
          alsoIn: ["pending-review", "pending-release"],
        }),
      ),
    ).toBe("Also in Pending review and Pending release.");
  });

  it("says nothing where membership is unknown", () => {
    expect(
      crossStageLine(
        row("pending-proposal", "new-local-work", { alsoIn: null }),
      ),
    ).toBeNull();
  });

  it("says nothing where the skill sits in one stage alone", () => {
    expect(
      crossStageLine(row("pending-proposal", "new-local-work")),
    ).toBeNull();
  });
});

// Deployed copies only ever come from a release, so local work on a skill the
// default branch already holds has not reached them (#1160).
describe("deployed copies line", () => {
  it("says deployed copies keep the earlier version of a changed skill", () => {
    expect(
      deployedCopiesLine(
        row("pending-proposal", "not-yet-proposed", { remoteTree: "abc" }),
      ),
    ).toBe(
      "Deployed copies still have the earlier version. They get this version after a release and a new deploy.",
    );
  });

  it("says it for new local work on a proposal too", () => {
    expect(
      deployedCopiesLine(
        row("pending-proposal", "new-local-work", { remoteTree: "abc" }),
      ),
    ).not.toBeNull();
  });

  it("says nothing for a skill the default branch does not hold", () => {
    expect(
      deployedCopiesLine(row("pending-proposal", "not-yet-proposed")),
    ).toBeNull();
  });

  it("says nothing for a local deletion", () => {
    expect(
      deployedCopiesLine(
        row("pending-proposal", "deleted-locally", {
          remoteTree: "abc",
          deletion: true,
        }),
      ),
    ).toBeNull();
  });

  it("says nothing outside Pending proposal", () => {
    expect(
      deployedCopiesLine(
        row("pending-release", "changed", { remoteTree: "abc" }),
      ),
    ).toBeNull();
  });
});

// The Pull request cell's words (#994): the card carries only fields the gh
// adapter already lets cross, so state and review are read off the status.
describe("pull request words", () => {
  it("names the link for what it opens", () => {
    expect(pullRequestLinkName(47)).toBe(
      "Pull request #47, opens in a new tab",
    );
  });

  it("labels the card's facts, and reads the branch arrow as a word", () => {
    expect(PULL_REQUEST_CARD).toEqual({
      review: "Review",
      requested: "Requested",
      branch: "Branch",
      into: "into",
    });
  });

  it("reads a request's state off the row's status", () => {
    const states: [StageStatus, string][] = [
      ["draft", "Draft"],
      ["waiting-for-review", "Open"],
      ["changes-requested", "Open"],
      ["approved-awaiting-merge", "Open"],
      ["multiple-pull-requests", "Open"],
      ["proposal-merged", "Merged"],
      ["proposal-closed", "Closed"],
    ];
    for (const [status, state] of states) {
      expect(pullRequestState(row("pending-review", status))).toBe(state);
    }
    expect(pullRequestState(row("pending-proposal", "new-local-work"))).toBe(
      null,
    );
  });

  it("names the review only where GitHub gave one", () => {
    expect(reviewWord(row("pending-review", "changes-requested"))).toBe(
      "Changes requested",
    );
    expect(reviewWord(row("pending-review", "approved-awaiting-merge"))).toBe(
      "Approved",
    );
    expect(reviewWord(row("pending-review", "waiting-for-review"))).toBe(
      "Waiting for review",
    );
    expect(reviewWord(row("pending-review", "draft"))).toBe(null);
  });

  it("lists the requested reviewers, uncapped", () => {
    expect(
      requestedReviewers(
        row("pending-review", "waiting-for-review", {
          reviewers: [
            { kind: "user", login: "ada" },
            { kind: "team", slug: "fimoklei/reviewers" },
          ],
        }),
      ),
    ).toBe("@ada, @fimoklei/reviewers");
    expect(requestedReviewers(row("pending-review", "draft"))).toBe(null);
  });

  it("names the other stages a skill is in, for the Also in column", () => {
    expect(
      alsoInWords(
        row("pending-proposal", "new-local-work", {
          alsoIn: ["pending-review", "pending-release"],
        }),
      ),
    ).toBe("Pending review, Pending release");
    expect(alsoInWords(row("pending-proposal", "new-local-work"))).toBe("");
    // Unknown membership is never read as "only here".
    expect(
      alsoInWords(row("pending-proposal", "new-local-work", { alsoIn: null })),
    ).toBe("");
  });
});
