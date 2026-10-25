import type {
  HarnessChange,
  HarnessStage,
  HarnessStageRow,
  StageStatus,
} from "@maestro/core";
import { describe, expect, it } from "vitest";
import { machineValues, unselectedControls } from "../test-utils";
import { plainText } from "../ui/phrase";
import { CHANGE_WORD } from "./change-words";
import {
  alsoInWords,
  changeSentence,
  correctionLine,
  crossStageLine,
  deployedCopiesLine,
  detailSentence,
  harnessCounts,
  pullRequestState,
  requestedReviewers,
  reviewerLine,
  reviewWord,
  type StageContext,
  statusReading,
} from "./stage-copy";
import { pullRequest } from "./stage-row-fixture";

// Contract tests: the words live once, in the copy module and the rendered
// Harness tests. These prove the rules every reading and sentence keeps.

const row = (
  stage: HarnessStage,
  status: StageStatus,
  over: Partial<HarnessStageRow> = {},
): HarnessStageRow => ({
  stage,
  type: "skill",
  name: "tdd",
  path: ".apm/skills/tdd",
  branch: "maestro/tdd",
  status,
  change: "edit",
  requests: [],
  reviewers: [],
  comparison: null,
  alsoIn: [],
  concurrentChange: false,
  waitingOn: null,
  localOnly: false,
  remoteTree: null,
  restorable: false,
  onDisk: false,
  ownsBranch: false,
  previousName: null,
  ...over,
});

// A Record so a status core adds, or one it drops, fails the typecheck until
// the list matches the union.
const ALL_STATUSES = Object.keys({
  "not-yet-proposed": true,
  "new-local-work": true,
  draft: true,
  "waiting-for-review": true,
  "changes-requested": true,
  "approved-awaiting-merge": true,
  "pull-request-missing": true,
  "proposal-merged": true,
  "proposal-closed": true,
  "multiple-pull-requests": true,
  "proposed-by-other": true,
  "not-yet-released": true,
} satisfies Record<StageStatus, true>) as StageStatus[];

const CHANGES: HarnessChange[] = ["addition", "edit", "deletion", "rename"];

const CONTEXT = {
  defaultBranch: "main",
  releasedVersion: "v1.4.0",
  origin: "github.com/fimoklei/agent-harness",
};
const request = pullRequest(45);

// Every status a row of the author's own work shows a sentence for.
const OWN_STATUSES = ALL_STATUSES.filter(
  (status) => status !== "proposed-by-other",
);

const detail = (
  status: StageStatus,
  over: Partial<HarnessStageRow> = {},
  context: StageContext = CONTEXT,
) =>
  detailSentence(
    row("pending-review", status, {
      requests: [request],
      previousName: "testing",
      ...over,
    }),
    context,
  );

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

  it("names the contributor a proposal waits on, in the neutral family", () => {
    const reading = statusReading(
      row("pending-review", "proposed-by-other", { waitingOn: "teammate" }),
    );

    expect(reading.family).toBe("neutral");
    expect(reading.word).toMatch(/\bteammate$/);
  });

  it("reads an approved proposal as good", () => {
    expect(
      statusReading(row("pending-review", "approved-awaiting-merge")),
    ).toMatchObject({ family: "good", glyph: "✓" });
  });

  it("gives every status a word of its own, capitalised", () => {
    const words = ALL_STATUSES.map(
      (status) => statusReading(row("pending-review", status)).word,
    );

    expect(new Set(words).size).toBe(ALL_STATUSES.length);
    for (const word of words) {
      expect(word[0], word).toBe(word[0]?.toUpperCase());
    }
  });

  // The Change column names the kind, so a status never does (#1399).
  it("reads a deletion's status as any other row's", () => {
    for (const change of CHANGES) {
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
  it("names each change by a word of its own", () => {
    expect(new Set(Object.values(CHANGE_WORD)).size).toBe(CHANGES.length);
  });

  it.each(CHANGES)(
    "states what the %s does to the Harness, setting the Harness apart",
    (change) => {
      const copy = changeSentence(
        row("pending-release", "not-yet-released", {
          change,
          previousName: "testing",
        }),
        CONTEXT,
      );

      expect(plainText(copy)).toMatch(/^This change .*\btdd\b/);
      expect(machineValues(copy)).toEqual([
        "github.com/fimoklei/agent-harness",
      ]);
    },
  );

  it("states every change in a sentence of its own", () => {
    const sentences = CHANGES.map((change) =>
      plainText(
        changeSentence(
          row("pending-release", "not-yet-released", { change }),
          CONTEXT,
        ),
      ),
    );

    expect(new Set(sentences).size).toBe(CHANGES.length);
  });

  // The release read can miss the old name; the sentence never invents one.
  it("states a rename without the old name when the read has none", () => {
    const rename = (previousName: string | null) =>
      plainText(
        changeSentence(
          row("pending-release", "not-yet-released", {
            change: "rename",
            previousName,
          }),
          CONTEXT,
        ),
      );

    expect(rename("testing")).toContain("testing");
    expect(rename(null)).not.toMatch(/ to tdd/);
  });
});

describe("Detail sentences", () => {
  // Cause first, then `Select {control} to {result}` naming the row's own
  // control (#838). A status with no cockpit control names the place instead.
  it.each<[StageStatus, string | null]>([
    ["not-yet-proposed", "Propose change"],
    ["new-local-work", "Update proposal"],
    ["draft", "View pull request"],
    ["waiting-for-review", null],
    ["changes-requested", "Update proposal"],
    ["approved-awaiting-merge", "View pull request"],
    ["pull-request-missing", "Create pull request"],
    ["proposal-merged", "Re-read Harness"],
    ["proposal-closed", "Reopen proposal"],
    ["multiple-pull-requests", null],
    ["not-yet-released", "Create a release"],
  ])("names the control of a %s row: %s", (status, control) => {
    for (const change of CHANGES) {
      const text = plainText(detail(status, { change }));
      const selected = [...text.matchAll(/Select (.+?) to /g)].map(
        (match) => match[1],
      );

      expect(selected, `${status} ${change}`).toEqual(
        control === null ? [] : [control],
      );
    }
  });

  it("gives every status a sentence of its own", () => {
    const sentences = OWN_STATUSES.map((status) => plainText(detail(status)));

    expect(new Set(sentences).size).toBe(OWN_STATUSES.length);
  });

  it.each<StageStatus>([
    "not-yet-proposed",
    "draft",
    "waiting-for-review",
    "changes-requested",
    "approved-awaiting-merge",
    "proposal-merged",
    "not-yet-released",
  ])("speaks of the deletion on a deleting %s row", (status) => {
    const deletion = plainText(detail(status, { change: "deletion" }));

    expect(deletion).toMatch(/delet/);
    expect(deletion).not.toEqual(plainText(detail(status)));
  });

  it("names the pull request it speaks of", () => {
    for (const status of [
      "new-local-work",
      "draft",
      "waiting-for-review",
      "changes-requested",
      "approved-awaiting-merge",
      "proposal-merged",
      "proposal-closed",
    ] as const) {
      expect(plainText(detail(status)), status).toContain("#45");
    }
  });

  it("names the row's own type wherever a sentence names one", () => {
    const prompt = {
      type: "prompt",
      name: "pr-review",
      path: ".maestro/prompts/pr-review.md",
      branch: "maestro/prompt.pr-review",
    } as const;
    for (const status of ALL_STATUSES) {
      for (const change of CHANGES) {
        for (const waitingOn of [null, "octocat"]) {
          const over = { change, waitingOn, onDisk: true };
          const skill = plainText(detail(status, over));
          const text = plainText(detail(status, { ...over, ...prompt }));
          const at = `${status} ${change} ${waitingOn}`;

          expect(text, at).not.toMatch(/skill|folder/);
          expect(/\bprompt\b/.test(text), at).toBe(/\bskill\b/.test(skill));
        }
      }
    }
  });

  it.each<[StageStatus, Partial<HarnessStageRow>, string, string | null]>([
    [
      "not-yet-proposed",
      { waitingOn: "octocat" },
      "octocat has pull request #45 open for this prompt. Wait until it is merged or closed.",
      null,
    ],
    [
      "not-yet-proposed",
      { change: "deletion" },
      "This prompt is deleted in your clone but still on main. Select Propose change to propose the deletion.",
      null,
    ],
    [
      "not-yet-proposed",
      { change: "addition" },
      "This prompt is not on main yet. Select Propose change to send it for review.",
      null,
    ],
    [
      "new-local-work",
      { requests: [] },
      "You edited this prompt after preparing its proposal. Select Update proposal to send the edits.",
      null,
    ],
    [
      "new-local-work",
      {},
      "You edited this prompt after pull request #45. Select Update proposal to send the edits.",
      null,
    ],
    [
      "draft",
      { change: "deletion" },
      "Pull request #45 proposes deleting this prompt and is still a draft. Select View pull request to mark it ready for review.",
      null,
    ],
    [
      "waiting-for-review",
      { change: "deletion" },
      "Pull request #45 proposes deleting this prompt and is waiting for a reviewer.",
      null,
    ],
    [
      "approved-awaiting-merge",
      { change: "deletion" },
      "Pull request #45 proposes deleting this prompt and is approved. Select View pull request to merge it.",
      null,
    ],
    [
      "proposed-by-other",
      {},
      "Another contributor has pull request #45 open for this prompt. Wait until it is merged or closed.",
      null,
    ],
    [
      "not-yet-released",
      { change: "addition" },
      "This prompt was added to main after release v1.4.0. Select Create a release to publish it.",
      "This prompt is on main and in no release yet. Select Create a release to publish it.",
    ],
    [
      "not-yet-released",
      { change: "edit" },
      "This prompt changed on main after release v1.4.0. Select Create a release to publish it.",
      "This prompt is on main and in no release yet. Select Create a release to publish it.",
    ],
    [
      "not-yet-released",
      { change: "rename" },
      "This prompt was renamed from testing on main. Select Create a release to publish it.",
      null,
    ],
    [
      "not-yet-released",
      { change: "rename", previousName: null },
      "This prompt was renamed on main. Select Create a release to publish it.",
      null,
    ],
    [
      "not-yet-released",
      { change: "deletion" },
      "This prompt was deleted from main after release v1.4.0. Select Create a release to publish the deletion.",
      "This prompt is no longer on main. Select Create a release to publish the deletion.",
    ],
  ])(
    "words a prompt's %s row as approved (%o)",
    (status, over, text, unreleased) => {
      const prompt = { type: "prompt", name: "pr-review", ...over } as const;

      expect(plainText(detail(status, prompt))).toBe(text);
      if (unreleased !== null) {
        expect(
          plainText(
            detail(status, prompt, { ...CONTEXT, releasedVersion: null }),
          ),
        ).toBe(unreleased);
      }
    },
  );

  it("says a prompt's file is back after its deletion was closed", () => {
    expect(
      plainText(
        detail("proposal-closed", {
          type: "prompt",
          change: "deletion",
          onDisk: true,
        }),
      ),
    ).toBe(
      "Pull request #45 was closed without merging. The file is back in your clone, so the prompt stays in the Harness.",
    );
  });

  it("states what a rename was renamed from", () => {
    expect(
      plainText(detail("not-yet-released", { change: "rename" })),
    ).toContain("testing");
  });

  // Over a default-branch copy the row also offers Discard change (#1375).
  it("names both controls on a change to a skill the default branch holds", () => {
    const sentence = plainText(
      detailSentence(
        row("pending-proposal", "not-yet-proposed", {
          remoteTree: "remote-tdd",
        }),
        CONTEXT,
      ),
    );

    expect(sentence).toMatch(/Select Propose change .*select Discard change/);
  });

  // One next action: Restore skill stays in the row menu (#1396).
  it("names Propose change alone on a restorable deleted row", () => {
    const deleted = (restorable: boolean) =>
      detailSentence(
        row("pending-proposal", "not-yet-proposed", {
          change: "deletion",
          restorable,
        }),
        CONTEXT,
      );

    expect(deleted(true)).toEqual(deleted(false));
    expect(plainText(deleted(true))).not.toMatch(/Restore skill/);
  });

  // Every row says the same: none offers a write while the request is open.
  it.each<[HarnessStage, StageStatus]>([
    ["pending-review", "proposed-by-other"],
    ["pending-proposal", "new-local-work"],
    ["pending-proposal", "not-yet-proposed"],
  ])(
    "tells the author to wait on another contributor's request in %s, %s",
    (stage, status) => {
      const sentence = plainText(
        detailSentence(
          row(stage, status, {
            requests: [{ ...request, author: "teammate", byOther: true }],
            waitingOn: "teammate",
          }),
          CONTEXT,
        ),
      );

      expect(sentence).toMatch(/^teammate .*#45/);
      expect(sentence).not.toMatch(/Select/);
    },
  );

  // Their request is theirs to reopen, so the sentence names the author's own way on.
  it.each([
    ["an edit", "edit" as const, true],
    ["a deletion whose folder is gone", "deletion" as const, false],
  ])(
    "names no reopen on another contributor's closed request for %s",
    (_, change, onDisk) => {
      const sentence = plainText(
        detail("proposal-closed", {
          requests: [{ ...request, author: "teammate", byOther: true }],
          change,
          onDisk,
        }),
      );

      expect(sentence).toMatch(/^teammate's .*Select Propose change/);
      expect(sentence).not.toMatch(/Reopen proposal/);
    },
  );

  // The menu offers no Reopen proposal here, so the sentence names none (#1384).
  it("names no control on a closed deletion whose folder is back", () => {
    expect(
      plainText(
        detail("proposal-closed", { change: "deletion", onDisk: true }),
      ),
    ).not.toMatch(/Select/);
  });

  it("names Create a release but no release when nothing is released yet", () => {
    const unreleased = { ...CONTEXT, releasedVersion: null };
    const sentences = CHANGES.map((change) =>
      detailSentence(
        row("pending-release", "not-yet-released", { change }),
        unreleased,
      ),
    );

    for (const sentence of sentences) {
      expect(plainText(sentence)).toContain("Select Create a release");
      expect(machineValues(sentence)).toEqual(["main"]);
    }
  });

  it("names no pull request when new local work has no request yet", () => {
    const sentence = plainText(
      detailSentence(row("pending-proposal", "new-local-work"), CONTEXT),
    );

    expect(sentence).not.toContain("#");
    expect(sentence).toContain("Select Update proposal");
  });

  it("names both of two matching requests", () => {
    const sentence = plainText(
      detail("multiple-pull-requests", {
        requests: [pullRequest(41), pullRequest(44)],
      }),
    );

    expect(sentence).toMatch(/#41 and #44/);
  });

  // The numbers grow without bound, so listing them past two would grow the
  // sentence past the length #840 settled. Every link stays in the row menu.
  it("keeps the sentence one length for three matching requests or more", () => {
    const several = (count: number) =>
      detail("multiple-pull-requests", {
        requests: [41, 44, 47, 50]
          .slice(0, count)
          .map((number) => pullRequest(number)),
      });

    expect(plainText(several(3))).not.toContain("#");
    expect(several(4)).toEqual(several(3));
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
    for (const status of OWN_STATUSES) {
      for (const change of CHANGES) {
        const text = plainText(detail(status, { change }));
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

  it("names every control it points to as select {Control}", () => {
    for (const status of OWN_STATUSES) {
      for (const change of CHANGES) {
        expect(
          unselectedControls(detail(status, { change })),
          `${status} ${change}`,
        ).toEqual([]);
      }
    }
  });
});

describe("the reviewer and cross-stage lines", () => {
  it("omits the reviewer line when nobody is requested", () => {
    expect(
      reviewerLine(row("pending-review", "waiting-for-review")),
    ).toBeNull();
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
    ).not.toBeNull();
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

  it("says nothing for a prompt, which no target deploys", () => {
    expect(
      deployedCopiesLine(
        row("pending-proposal", "not-yet-proposed", {
          type: "prompt",
          remoteTree: "abc",
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

// A merged change waiting for release is corrected, not withdrawn, when only
// its content is wrong (#1685).
describe("correction line", () => {
  it("names Edit prompt on a Pending release prompt row", () => {
    expect(
      correctionLine(
        row("pending-release", "not-yet-released", { type: "prompt" }),
      ),
    ).toBe("To correct this change, select Edit prompt.");
  });

  it("names the deployed copy and Import local edits on a Pending release skill row", () => {
    expect(correctionLine(row("pending-release", "not-yet-released"))).toBe(
      "To correct this change, edit the deployed copy. Then select Import local edits on Deploy-state.",
    );
  });

  it("says nothing outside Pending release", () => {
    for (const [stage, status] of [
      ["pending-proposal", "not-yet-proposed"],
      ["pending-review", "waiting-for-review"],
    ] as const) {
      for (const type of ["skill", "prompt"] as const) {
        expect(correctionLine(row(stage, status, { type }))).toBeNull();
      }
    }
  });
});

// The Pull request cell's words (#994): the card carries only fields the gh
// adapter already lets cross, so state and review are read off the status.
describe("pull request words", () => {
  const state = (status: StageStatus) =>
    pullRequestState(row("pending-review", status));

  it("reads one state for every open request", () => {
    const open = [
      "waiting-for-review",
      "changes-requested",
      "approved-awaiting-merge",
      "multiple-pull-requests",
      "proposed-by-other",
    ] as const;

    expect(new Set(open.map(state)).size).toBe(1);
  });

  it("reads a draft, a merged and a closed request apart from an open one", () => {
    const states = [
      "draft",
      "waiting-for-review",
      "proposal-merged",
      "proposal-closed",
    ].map((status) => state(status as StageStatus));

    expect(states).not.toContain(null);
    expect(new Set(states).size).toBe(4);
  });

  it("reads no state where no request exists", () => {
    expect(pullRequestState(row("pending-proposal", "new-local-work"))).toBe(
      null,
    );
  });

  it("names the review only where GitHub gave one", () => {
    const review = (status: StageStatus) =>
      reviewWord(row("pending-review", status));

    expect(
      new Set(
        (
          [
            "waiting-for-review",
            "changes-requested",
            "approved-awaiting-merge",
          ] as const
        ).map(review),
      ).size,
    ).toBe(3);
    expect(review("draft")).toBe(null);
  });

  it("lists the requested reviewers, uncapped", () => {
    expect(requestedReviewers(row("pending-review", "draft"))).toBe(null);
  });

  // Unknown membership is never read as "only here".
  it("names no other stage where membership is unknown", () => {
    expect(alsoInWords(row("pending-proposal", "new-local-work"))).toBe("");
    expect(
      alsoInWords(row("pending-proposal", "new-local-work", { alsoIn: null })),
    ).toBe("");
  });
});

describe("harnessCounts", () => {
  it("counts the Pending review and Pending release rows as attention, Pending release as Create a release's gate", () => {
    expect(
      harnessCounts([
        "pending-proposal",
        "pending-review",
        "pending-release",
        "pending-release",
      ]),
    ).toEqual([
      { word: "Pending review", count: 1, family: "attention" },
      {
        word: "Pending release",
        count: 2,
        family: "attention",
        gate: true,
      },
    ]);
  });
});
