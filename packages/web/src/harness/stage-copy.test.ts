import { describe, expect, it } from "vitest";
import {
  crossStageLine,
  detailSentence,
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

const CONTEXT = { defaultBranch: "main", releasedVersion: "v1.4.0" };
const request = { number: 45, url: "https://github.com/o/r/pull/45" };

describe("chip readings", () => {
  it("gives waiting and local work a grey chip", () => {
    expect(statusTone(row("pending-proposal", "not-yet-proposed"))).toBe("dim");
    expect(statusTone(row("pending-proposal", "new-local-work"))).toBe("dim");
    expect(statusTone(row("pending-proposal", "deleted-locally"))).toBe("dim");
    expect(statusTone(row("pending-review", "waiting-for-review"))).toBe("dim");
  });

  it("gives every state that needs the author an amber chip", () => {
    for (const status of [
      "draft",
      "changes-requested",
      "approved-awaiting-merge",
      "pull-request-missing",
      "proposal-closed",
      "multiple-pull-requests",
    ] as const) {
      expect(statusTone(row("pending-review", status))).toBe("drift");
    }
  });

  it("gives merged changes a green chip", () => {
    for (const status of ["added", "changed", "renamed", "deleted"] as const) {
      expect(statusTone(row("pending-release", status))).toBe("ok");
    }
  });

  it("carries every reading as text, never colour alone", () => {
    expect(statusReading(row("pending-review", "changes-requested"))).toBe(
      "Changes requested",
    );
    expect(statusReading(row("pending-release", "deleted"))).toBe("Deleted");
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
    ).toBe("Deletion changes requested");
    expect(
      statusReading(
        row("pending-review", "approved-awaiting-merge", { deletion: true }),
      ),
    ).toBe("Deletion approved, awaiting merge");
  });
});

describe("Detail sentences", () => {
  it("states the approved sentence for a requested change", () => {
    expect(
      detailSentence(
        row("pending-review", "changes-requested", { requests: [request] }),
        CONTEXT,
      ),
    ).toBe(
      "A reviewer asked for changes on pull request #45; the review is on GitHub.",
    );
  });

  it("states the approved sentence for a requested change on a deletion", () => {
    expect(
      detailSentence(
        row("pending-review", "changes-requested", {
          requests: [request],
          deletion: true,
        }),
        CONTEXT,
      ),
    ).toBe(
      "A reviewer asked for changes on pull request #45, which proposes deleting this skill.",
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
