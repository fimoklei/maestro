import type {
  HarnessChange,
  HarnessStage,
  HarnessStageRow,
  StageStatus,
} from "@maestro/core";
import { describe, expect, it } from "vitest";
import { machineValues } from "../test-utils";
import { plainText } from "../ui/phrase";
import {
  alsoInWords,
  CHANGE_WORDS,
  changeSentence,
  crossStageLine,
  deployedCopiesLine,
  detailSentence,
  JOURNEY_EMPTY,
  PULL_REQUEST_CARD,
  pullRequestLinkName,
  pullRequestState,
  requestedReviewers,
  reviewerLine,
  reviewWord,
  statusReading,
} from "./stage-copy";
import { pullRequest } from "./stage-row-fixture";

const row = (
  stage: HarnessStage,
  status: StageStatus,
  over: Partial<HarnessStageRow> = {},
): HarnessStageRow => ({
  stage,
  skill: "tdd",
  status,
  change: "edit",
  requests: [],
  reviewers: [],
  comparison: null,
  alsoIn: [],
  concurrentChange: false,
  localOnly: false,
  remoteTree: null,
  restorable: false,
  folderOnDisk: false,
  previousName: null,
  ...over,
});

const ALL_STATUSES: StageStatus[] = [
  "not-yet-proposed",
  "new-local-work",
  "draft",
  "waiting-for-review",
  "changes-requested",
  "approved-awaiting-merge",
  "pull-request-missing",
  "proposal-merged",
  "proposal-closed",
  "multiple-pull-requests",
  "not-yet-released",
];

const CONTEXT = {
  defaultBranch: "main",
  releasedVersion: "v1.4.0",
  origin: "github.com/fimoklei/agent-harness",
};
const request = pullRequest(45);

describe("the empty journey", () => {
  it("states a confirmed empty journey", () => {
    expect(JOURNEY_EMPTY).toEqual({
      title: "No changes yet",
      body: "Skills you import or edit in your clone will appear here.",
    });
  });
});

// Five families, word first (#994): the reading survives without colour.
describe("status readings", () => {
  it("leaves every expected reading neutral", () => {
    for (const [stage, status] of [
      ["pending-proposal", "not-yet-proposed"],
      ["pending-proposal", "new-local-work"],
      ["pending-review", "draft"],
      ["pending-review", "waiting-for-review"],
      ["pending-review", "proposal-merged"],
      ["pending-release", "not-yet-released"],
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
      ["waiting-for-review", "Waiting for review"],
      ["draft", "Draft"],
      ["changes-requested", "Changes requested"],
      ["approved-awaiting-merge", "Approved, awaiting merge"],
      ["pull-request-missing", "Pull request missing"],
      ["proposal-merged", "Proposal merged"],
      ["proposal-closed", "Proposal closed"],
      ["multiple-pull-requests", "Multiple pull requests"],
      ["not-yet-released", "Not yet released"],
    ];
    for (const [status, word] of readings) {
      expect(statusReading(row("pending-review", status)).word).toBe(word);
    }
  });

  // The Change column names the kind, so a status never does (#1399).
  it("reads a deletion's status as any other row's", () => {
    for (const change of ["addition", "edit", "deletion", "rename"] as const) {
      for (const status of ALL_STATUSES) {
        expect(
          statusReading(row("pending-review", status, { change })),
        ).toEqual(statusReading(row("pending-review", status)));
      }
    }
  });
});

// What merging the row's change does to the Harness (#1399).
describe("the Change column", () => {
  it("names each change as its word", () => {
    expect(CHANGE_WORDS).toEqual({
      addition: "Addition",
      edit: "Edit",
      deletion: "Deletion",
      rename: "Rename",
    });
  });

  it.each<[HarnessChange, string]>([
    ["addition", "This change adds tdd to github.com/fimoklei/agent-harness."],
    ["edit", "This change edits tdd in github.com/fimoklei/agent-harness."],
    [
      "deletion",
      "This change deletes tdd from github.com/fimoklei/agent-harness.",
    ],
    [
      "rename",
      "This change renames testing to tdd in github.com/fimoklei/agent-harness.",
    ],
  ])("states what the %s does to the Harness", (change, sentence) => {
    const copy = changeSentence(
      row("pending-release", "not-yet-released", {
        change,
        previousName: "testing",
      }),
      CONTEXT,
    );
    expect(plainText(copy)).toBe(sentence);
    expect(machineValues(copy)).toEqual(["github.com/fimoklei/agent-harness"]);
  });

  // The release read can miss the old name; the sentence never invents one.
  it("states a rename without the old name when the read has none", () => {
    expect(
      plainText(
        changeSentence(
          row("pending-release", "not-yet-released", { change: "rename" }),
          CONTEXT,
        ),
      ),
    ).toBe("This change renames tdd in github.com/fimoklei/agent-harness.");
  });
});

describe("Detail sentences", () => {
  // Cause first, then `Select {control} to {result}` naming the row's own
  // control (#838). A status with no cockpit control names the place instead.
  const approved: [StageStatus, HarnessChange, string][] = [
    [
      "not-yet-proposed",
      "edit",
      "Your local copy differs from main. Select Propose change to send it for review.",
    ],
    [
      "not-yet-proposed",
      "addition",
      "This skill is not on main yet. Select Propose change to send it for review.",
    ],
    [
      "not-yet-proposed",
      "deletion",
      "This skill is deleted in your clone but still on main. Select Propose change to propose the deletion.",
    ],
    [
      "new-local-work",
      "edit",
      "You edited this skill after pull request #45. Select Update proposal to send the edits.",
    ],
    [
      "draft",
      "edit",
      "Pull request #45 is a draft. Select View pull request to mark it ready for review.",
    ],
    [
      "draft",
      "deletion",
      "Pull request #45 proposes deleting this skill and is still a draft. Select View pull request to mark it ready for review.",
    ],
    [
      "waiting-for-review",
      "edit",
      "Pull request #45 is open and waiting for a reviewer.",
    ],
    [
      "waiting-for-review",
      "deletion",
      "Pull request #45 proposes deleting this skill and is waiting for a reviewer.",
    ],
    [
      "changes-requested",
      "edit",
      "A reviewer asked for changes on pull request #45. Select Update proposal to send your changes.",
    ],
    [
      "changes-requested",
      "deletion",
      "A reviewer asked for changes on the deletion in pull request #45. Select Update proposal to send your changes.",
    ],
    [
      "approved-awaiting-merge",
      "edit",
      "Pull request #45 is approved. Select View pull request to merge it.",
    ],
    [
      "approved-awaiting-merge",
      "deletion",
      "Pull request #45 proposes deleting this skill and is approved. Select View pull request to merge it.",
    ],
    [
      "pull-request-missing",
      "edit",
      "The proposal branch is on GitHub without a pull request. Select Create pull request to open one.",
    ],
    [
      "proposal-merged",
      "edit",
      "Pull request #45 was merged. Select Re-read Harness to read GitHub again.",
    ],
    [
      "proposal-merged",
      "deletion",
      "Pull request #45 merged the deletion. Select Re-read Harness to read GitHub again.",
    ],
    [
      "proposal-closed",
      "edit",
      "Pull request #45 was closed without merging. Select Reopen proposal to continue it.",
    ],
    [
      "not-yet-released",
      "addition",
      "This skill was added to main after release v1.4.0. Select Create a release to publish it.",
    ],
    [
      "not-yet-released",
      "edit",
      "This skill changed on main after release v1.4.0. Select Create a release to publish it.",
    ],
    [
      "not-yet-released",
      "rename",
      "This skill was renamed from testing on main. Select Create a release to publish it.",
    ],
    [
      "not-yet-released",
      "deletion",
      "This skill was deleted from main after release v1.4.0. Select Create a release to publish the deletion.",
    ],
  ];

  it.each(approved)(
    "states the approved sentence for %s (change: %s)",
    (status, change, sentence) => {
      expect(
        plainText(
          detailSentence(
            row("pending-review", status, {
              requests: [request],
              change,
              previousName: "testing",
            }),
            CONTEXT,
          ),
        ),
      ).toBe(sentence);
    },
  );

  // Over a default-branch copy the row also offers Discard change (#1375).
  it("names both controls on a change to a skill the default branch holds", () => {
    expect(
      plainText(
        detailSentence(
          row("pending-proposal", "not-yet-proposed", {
            remoteTree: "remote-tdd",
          }),
          CONTEXT,
        ),
      ),
    ).toBe(
      "Your local copy differs from main. Select Propose change to send it for review, or Discard change to match main again.",
    );
  });

  // One next action: Restore skill stays in the row menu (#1396).
  it.each(["not-yet-proposed"] as const)(
    "names Propose change alone on a restorable %s row",
    (status) => {
      expect(
        plainText(
          detailSentence(
            row("pending-proposal", status, {
              change: "deletion",
              restorable: true,
            }),
            CONTEXT,
          ),
        ),
      ).toBe(
        "This skill is deleted in your clone but still on main. Select Propose change to propose the deletion.",
      );
    },
  );

  // The menu offers no Reopen proposal here, so the sentence names none (#1384).
  it("names no reopen on a closed deletion whose folder is back", () => {
    expect(
      plainText(
        detailSentence(
          row("pending-review", "proposal-closed", {
            requests: [request],
            change: "deletion",
            folderOnDisk: true,
          }),
          CONTEXT,
        ),
      ),
    ).toBe(
      "Pull request #45 was closed without merging. The folder is back in your clone, so the skill stays in the Harness.",
    );
  });

  it("names the next step when nothing is released yet", () => {
    const unreleased = { ...CONTEXT, releasedVersion: null };
    expect(
      plainText(
        detailSentence(
          row("pending-release", "not-yet-released", { change: "addition" }),
          unreleased,
        ),
      ),
    ).toBe(
      "This skill is on main and in no release yet. Select Create a release to publish it.",
    );
    expect(
      plainText(
        detailSentence(
          row("pending-release", "not-yet-released", { change: "deletion" }),
          unreleased,
        ),
      ),
    ).toBe(
      "This skill is no longer on main. Select Create a release to publish the deletion.",
    );
    expect(
      plainText(
        detailSentence(
          row("pending-release", "not-yet-released", { change: "rename" }),
          unreleased,
        ),
      ),
    ).toBe(
      "This skill was renamed on main. Select Create a release to publish it.",
    );
  });

  it("names the prepared proposal when new local work has no request yet", () => {
    expect(
      plainText(
        detailSentence(row("pending-proposal", "new-local-work"), CONTEXT),
      ),
    ).toBe(
      "You edited this skill after preparing its proposal. Select Update proposal to send the edits.",
    );
  });

  it("states the approved sentence for two matching requests", () => {
    expect(
      plainText(
        detailSentence(
          row("pending-review", "multiple-pull-requests", {
            requests: [pullRequest(41), pullRequest(44)],
          }),
          CONTEXT,
        ),
      ),
    ).toBe(
      "Pull requests #41 and #44 both match this branch. Open the extra pull requests on GitHub and close them.",
    );
  });

  // The numbers grow without bound, so listing them past two would grow the
  // sentence past the length #840 settled. Every link stays in the row menu.
  it("keeps the sentence one length for three matching requests or more", () => {
    expect(
      plainText(
        detailSentence(
          row("pending-review", "multiple-pull-requests", {
            requests: [pullRequest(41), pullRequest(44), pullRequest(47)],
          }),
          CONTEXT,
        ),
      ),
    ).toBe(
      "Several pull requests match this branch. Open the extra pull requests on GitHub and close them.",
    );
  });

  it("names the branch it compared against when no proposal exists", () => {
    expect(
      plainText(
        detailSentence(row("pending-proposal", "not-yet-proposed"), CONTEXT),
      ),
    ).toContain("main");
  });

  it.each([
    ["pending-proposal", "not-yet-proposed", "deletion", ["main"]],
    ["pending-proposal", "not-yet-proposed", "addition", ["main"]],
    ["pending-proposal", "not-yet-proposed", "edit", ["main"]],
    ["pending-release", "not-yet-released", "addition", ["main", "v1.4.0"]],
    ["pending-release", "not-yet-released", "edit", ["main", "v1.4.0"]],
    ["pending-release", "not-yet-released", "rename", ["main"]],
    ["pending-release", "not-yet-released", "deletion", ["main", "v1.4.0"]],
  ] as const)(
    "sets the branch and release apart in %s %s (%s)",
    (stage, status, change, values) => {
      const sentence = detailSentence(
        row(stage, status, { change, previousName: "testing" }),
        CONTEXT,
      );

      expect(machineValues(sentence)).toEqual(values);
    },
  );

  it("keeps the fallback branch words in plain text", () => {
    const sentence = detailSentence(
      row("pending-release", "not-yet-released", { change: "addition" }),
      { ...CONTEXT, defaultBranch: null },
    );

    expect(machineValues(sentence)).toEqual(["v1.4.0"]);
  });

  it("keeps every sentence within two sentences of fifteen words", () => {
    const statuses = [
      "not-yet-proposed",
      "new-local-work",
      "draft",
      "waiting-for-review",
      "changes-requested",
      "approved-awaiting-merge",
      "pull-request-missing",
      "proposal-merged",
      "proposal-closed",
      "not-yet-released",
    ] as const;
    for (const status of statuses) {
      for (const change of [
        "addition",
        "edit",
        "deletion",
        "rename",
      ] as const) {
        const sentence = detailSentence(
          row("pending-review", status, {
            requests: [request],
            change,
            previousName: "testing",
          }),
          CONTEXT,
        );
        const text = plainText(sentence);
        const clauses = text.split(". ").filter((part) => part !== "");
        expect(clauses.length, text).toBeLessThanOrEqual(2);
        for (const clause of clauses) {
          expect(clause.split(" ").length, clause).toBeLessThanOrEqual(15);
        }
        // F1: every sentence starts capitalised.
        expect(text[0], text).toBe(text[0]?.toUpperCase());
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
    ).toBe("Deployed copies change only after a release and Update target.");
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
      deployedCopiesLine(
        row("pending-proposal", "not-yet-proposed", { change: "addition" }),
      ),
    ).toBeNull();
  });

  it("says nothing for a local deletion", () => {
    expect(
      deployedCopiesLine(
        row("pending-proposal", "not-yet-proposed", {
          remoteTree: "abc",
          change: "deletion",
        }),
      ),
    ).toBeNull();
  });

  it("says nothing outside Pending proposal", () => {
    expect(
      deployedCopiesLine(
        row("pending-release", "not-yet-released", { remoteTree: "abc" }),
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
