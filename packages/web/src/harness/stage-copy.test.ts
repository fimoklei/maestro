import { describe, expect, it } from "vitest";
import {
  crossStageLine,
  detailSentence,
  PROPOSAL_EMPTY,
  reviewerLine,
  statusReading,
  statusTone,
} from "./stage-copy";
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
  remoteTree: null,
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
  "proposal-closed",
  "multiple-pull-requests",
  "added",
  "changed",
  "renamed",
  "deleted",
];

const CONTEXT = { defaultBranch: "main", releasedVersion: "v1.4.0" };
const request = { number: 45, url: "https://github.com/o/r/pull/45" };

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

describe("chip readings", () => {
  it("leaves every expected reading in its stage colourless", () => {
    for (const [stage, status] of [
      ["pending-proposal", "not-yet-proposed"],
      ["pending-proposal", "new-local-work"],
      ["pending-proposal", "deleted-locally"],
      ["pending-review", "draft"],
      ["pending-review", "waiting-for-review"],
      ["pending-review", "changes-requested"],
      ["pending-review", "approved-awaiting-merge"],
      ["pending-release", "added"],
      ["pending-release", "changed"],
      ["pending-release", "renamed"],
      ["pending-release", "deleted"],
    ] as [HarnessStage, StageStatus][]) {
      expect(statusTone(row(stage, status))).toBe("dim");
    }
  });

  it("gives the three Pending review exceptions an amber chip", () => {
    for (const status of [
      "pull-request-missing",
      "proposal-closed",
      "multiple-pull-requests",
    ] as const) {
      expect(statusTone(row("pending-review", status))).toBe("drift");
    }
  });

  it("never gives a stage chip green", () => {
    for (const status of ALL_STATUSES) {
      expect(statusTone(row("pending-review", status))).not.toBe("ok");
    }
  });

  it("carries every reading as text, never colour alone", () => {
    expect(statusReading(row("pending-review", "pull-request-missing"))).toBe(
      "▲ Pull request missing",
    );
    expect(statusReading(row("pending-release", "deleted"))).toBe("● Deleted");
  });

  // Never-Colour-Alone (DESIGN.md § 2): the three exceptions read ▲, every
  // expected reading reads ●.
  it("prefixes every reading with the glyph its tone carries", () => {
    const readings: [StageStatus, string][] = [
      ["not-yet-proposed", "● Not yet proposed"],
      ["new-local-work", "● New local work"],
      ["deleted-locally", "● Deleted locally"],
      ["waiting-for-review", "● Waiting for review"],
      ["draft", "● Draft"],
      ["changes-requested", "● Changes requested"],
      ["approved-awaiting-merge", "● Approved, awaiting merge"],
      ["pull-request-missing", "▲ Pull request missing"],
      ["proposal-closed", "▲ Proposal closed"],
      ["multiple-pull-requests", "▲ Multiple pull requests"],
      ["added", "● Added"],
      ["changed", "● Changed"],
      ["renamed", "● Renamed"],
      ["deleted", "● Deleted"],
    ];
    for (const [status, reading] of readings) {
      expect(statusReading(row("pending-review", status))).toBe(reading);
    }
  });

  it("gives a deletion one reading in each stage of the journey", () => {
    // The six readings of #847, each in the stage that carries it.
    const six: [HarnessStage, StageStatus, string][] = [
      ["pending-proposal", "deleted-locally", "● Deleted locally"],
      ["pending-review", "draft", "● Deletion in draft"],
      ["pending-review", "waiting-for-review", "● Deletion waiting for review"],
      ["pending-review", "changes-requested", "● Deletion changes requested"],
      [
        "pending-review",
        "approved-awaiting-merge",
        "● Deletion approved, awaiting merge",
      ],
      ["pending-release", "deleted", "● Deleted"],
    ];
    for (const [stage, status, reading] of six) {
      expect(statusReading(row(stage, status, { deletion: true }))).toBe(
        reading,
      );
    }
  });

  it("keeps a deletion's own reading in the stage it is in", () => {
    expect(
      statusReading(
        row("pending-review", "changes-requested", { deletion: true }),
      ),
    ).toBe("● Deletion changes requested");
    expect(
      statusReading(
        row("pending-review", "approved-awaiting-merge", { deletion: true }),
      ),
    ).toBe("● Deletion approved, awaiting merge");
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
      "Pull request #45 is a draft. Mark it ready for review on GitHub.",
    ],
    [
      "draft",
      true,
      "Pull request #45 proposes deleting this skill and is still a draft. Mark it ready for review on GitHub.",
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
      "Pull request #45 is approved. Merge it on GitHub.",
    ],
    [
      "approved-awaiting-merge",
      true,
      "Pull request #45 proposes deleting this skill and is approved. Merge it on GitHub.",
    ],
    [
      "pull-request-missing",
      false,
      "The proposal branch is on GitHub without a pull request. Select Create pull request to open one.",
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
          requests: [
            { number: 41, url: "https://github.com/o/r/pull/41" },
            { number: 44, url: "https://github.com/o/r/pull/44" },
          ],
        }),
        CONTEXT,
      ),
    ).toBe(
      "Pull requests #41 and #44 both match this branch, so close one on GitHub.",
    );
  });

  // The numbers grow without bound, so listing them past two would grow the
  // sentence past the length #840 settled. Every link stays in the row menu.
  it("keeps the sentence one length for three matching requests or more", () => {
    expect(
      detailSentence(
        row("pending-review", "multiple-pull-requests", {
          requests: [
            { number: 41, url: "https://github.com/o/r/pull/41" },
            { number: 44, url: "https://github.com/o/r/pull/44" },
            { number: 47, url: "https://github.com/o/r/pull/47" },
          ],
        }),
        CONTEXT,
      ),
    ).toBe(
      "Several pull requests match this branch, so close all but one on GitHub.",
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
