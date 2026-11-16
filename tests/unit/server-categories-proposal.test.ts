// The categories pull request over HTTP: the row on Categories in Settings,
// the dialog's difference and Create pull request, over an in-memory disk,
// Harness and GitHub.
import type {
  CategoriesProposalPreview,
  CategoriesProposalRow,
  HarnessReviewRead,
} from "@maestro/core";
import { describe, expect, it } from "vitest";
import {
  answered,
  BRANCH,
  FILE,
  PULL,
  prompt,
  request,
  skill,
  world,
} from "../helpers/categories-proposal-world";

describe("the pull-request row on Categories in Settings", () => {
  it("offers Create pull request for an own list", async () => {
    const { tipHolds, own, row } = world();
    tipHolds(["tdd"]);
    await own(["Planning"]);

    expect(await row()).toEqual({
      status: 200,
      body: { state: "start" } satisfies CategoriesProposalRow,
    });
  });

  it("blocks an empty own list", async () => {
    const { tipHolds, row } = world();
    tipHolds(["tdd"]);

    expect((await row()).body).toEqual({
      state: "empty",
    } satisfies CategoriesProposalRow);
  });

  it("blocks a list over 200 categories", async () => {
    const { tipHolds, own, row } = world();
    tipHolds(["tdd"]);
    await own(Array.from({ length: 201 }, (_, at) => `C${at}`));

    expect((await row()).body).toEqual({
      state: "over-limits",
    } satisfies CategoriesProposalRow);
  });

  it("waits for another contributor's open pull request, naming them", async () => {
    const { tipHolds, own, review, row } = world();
    tipHolds(["tdd"]);
    await own(["Planning"]);
    review.answer(answered([request({ author: "mira" })]));

    expect((await row()).body).toEqual({
      state: "waiting-on-other",
      author: "mira",
      number: 46,
      url: `${PULL}/46`,
    } satisfies CategoriesProposalRow);
  });

  it("states another contributor's open pull request ahead of an empty list", async () => {
    const { tipHolds, review, row } = world();
    tipHolds(["tdd"]);
    review.answer(answered([request({ author: "mira" })]));

    expect((await row()).body).toMatchObject({ state: "waiting-on-other" });
  });

  it.each([
    [null, "waiting-for-review"],
    ["review-required", "waiting-for-review"],
    ["changes-requested", "changes-requested"],
  ] as const)(
    "states the operator's own open pull request with decision %s as %s",
    async (decision, status) => {
      const { tipHolds, own, harness, review, row } = world();
      tipHolds(["tdd"]);
      await own(["Planning"]);
      // The branch carries no categories file yet.
      harness.promote["list.categories"] = "tip";
      review.answer(
        answered([request({ number: 45, url: `${PULL}/45`, decision })]),
      );

      expect((await row()).body).toEqual({
        state: "own-open",
        status,
        number: 45,
        url: `${PULL}/45`,
        list: "differs",
      } satisfies CategoriesProposalRow);
    },
  );

  it("leaves a pull request on another branch or into another base alone", async () => {
    const { tipHolds, own, review, row } = world();
    tipHolds(["tdd"]);
    await own(["Planning"]);
    review.answer(
      answered([
        request({ author: "mira", headBranch: "maestro/tdd" }),
        request({ author: "mira", baseBranch: "release" }),
      ]),
    );

    expect((await row()).body).toEqual({ state: "start" });
  });

  it.each<[string, HarnessReviewRead]>([
    ["GitHub could not be read", { outcome: "failed" }],
    ["gh is missing", { outcome: "unavailable", reason: "no-gh" }],
    ["gh got no answer", { outcome: "unavailable", reason: "no-answer" }],
    [
      "the read filled its bound",
      { outcome: "read", requests: [], complete: false, limit: 100 },
    ],
  ])("is unread when %s", async (_, read) => {
    const { tipHolds, own, review, row } = world();
    tipHolds(["tdd"]);
    await own(["Planning"]);
    review.answer(read);

    expect((await row()).body).toEqual({ state: "unread" });
  });

  it("is unread when the default branch could not be read", async () => {
    const { tipHolds, own, harness, row } = world();
    tipHolds(["tdd"]);
    await own(["Planning"]);
    harness.unreadable.add("tip");

    expect((await row()).body).toEqual({ state: "unread" });
  });
});

describe("the difference against the next release", () => {
  const NEXT = [
    "version: 1",
    "categories: [Planning, Debugging, Writing]",
    "assignments:",
    "  - { type: skill, name: tdd, category: Planning }",
    "  - { type: skill, name: debug, category: Debugging }",
    "  - { type: prompt, name: notes, category: Debugging }",
    "  - { type: skill, name: write, category: Writing }",
    "",
  ].join("\n");

  it("groups the categories added and deleted and the items moved", async () => {
    const { tipHolds, own, preview } = world();
    tipHolds(["tdd", "debug", "write", "review"], {
      prompts: ["notes"],
      files: { [FILE]: NEXT },
    });
    await own(
      ["Planning", "Writing", "Review"],
      [
        { ...skill("tdd"), category: "Writing" },
        { ...skill("write"), category: "Writing" },
        { ...skill("review"), category: "Review" },
      ],
    );

    expect(await preview()).toEqual({
      status: 200,
      body: {
        kind: "changes",
        added: [{ name: "Review", skills: 1, prompts: 0 }],
        deleted: [{ name: "Debugging", skills: 1, prompts: 1 }],
        moved: [{ type: "skill", name: "tdd", category: "Writing" }],
      } satisfies CategoriesProposalPreview,
    });
  });

  it("compares with no categories where the next release has no file", async () => {
    const { tipHolds, own, preview } = world();
    tipHolds(["tdd"]);
    await own(["Planning"], [{ ...skill("tdd"), category: "Planning" }]);

    expect((await preview()).body).toEqual({
      kind: "changes",
      added: [{ name: "Planning", skills: 1, prompts: 0 }],
      deleted: [],
      moved: [],
    });
  });

  it("says the list matches the next release", async () => {
    const { tipHolds, own, preview } = world();
    tipHolds(["tdd"], {
      files: {
        [FILE]:
          "version: 1\ncategories: [Writing, Planning]\nassignments:\n  - { type: skill, name: tdd, category: Planning }\n",
      },
    });
    await own(
      ["Planning", "Writing"],
      [{ ...skill("tdd"), category: "Planning" }],
    );

    expect((await preview()).body).toEqual({ kind: "unchanged" });
  });

  it("cannot compare with a next-release file that has an error", async () => {
    const { tipHolds, own, preview } = world();
    tipHolds(["tdd"], { files: { [FILE]: "categories: [\n" } });
    await own(["Planning"]);

    expect((await preview()).body).toEqual({ kind: "uncompared" });
  });

  it("refuses another contributor's open pull request on a fresh read", async () => {
    const { tipHolds, own, review, preview } = world();
    tipHolds(["tdd"]);
    await own(["Planning"]);
    review.answer(answered([request({ author: "mira" })]));

    expect(await preview()).toEqual({
      status: 409,
      body: { error: "proposed-by-other" },
    });
  });
});

describe("Create pull request", () => {
  it("pushes the list onto the default-branch tip and opens one pull request", async () => {
    const { tipHolds, own, draft, harness, review, submit } = world();
    tipHolds(["tdd"]);
    await draft(prompt("notes"));
    await own(
      ["Writing", "Planning"],
      [
        { ...skill("tdd"), category: "Planning" },
        { ...prompt("notes"), category: "Writing" },
      ],
    );

    expect(await submit()).toEqual({
      status: 200,
      body: {
        pullRequest: { state: "opened", number: 101, url: `${PULL}/101` },
      },
    });
    expect(harness.listPushes).toEqual([
      {
        branch: BRANCH,
        parents: ["tip"],
        text: [
          "version: 1",
          "categories:",
          "  - Planning",
          "  - Writing",
          "assignments:",
          "  - type: skill",
          "    name: tdd",
          "    category: Planning",
          "  - type: prompt",
          "    name: notes",
          "    category: Writing",
          "",
        ].join("\n"),
      },
    ]);
    expect(review.created).toEqual([
      {
        head: BRANCH,
        base: "main",
        title: "Set Harness categories",
        body: "Proposed from the Maestro cockpit.",
      },
    ]);
  });

  it("writes no assignment for an item neither the Working harness nor the next release holds", async () => {
    const { tipHolds, own, harness, submit } = world();
    tipHolds(["tdd"]);
    await own(["Planning"], [{ ...skill("tdd"), category: "Planning" }]);
    // Gone from the default branch since the list was sorted.
    harness.commit("later", {}, { parent: "tip" });
    harness.tip = "later";

    await submit();

    expect(harness.listPushes[0]?.text).toBe(
      "version: 1\ncategories:\n  - Planning\nassignments: []\n",
    );
  });

  it("creates the pull request over a next-release file with an error", async () => {
    const { tipHolds, own, submit } = world();
    tipHolds(["tdd"], { files: { [FILE]: "categories: [\n" } });
    await own(["Planning"]);

    expect((await submit()).status).toBe(200);
  });

  it.each([
    ["an empty list", async () => {}, "list-empty"],
    [
      "a list over 200 categories",
      async (w: ReturnType<typeof world>) =>
        w.own(Array.from({ length: 201 }, (_, at) => `C${at}`)),
      "list-too-large",
    ],
    [
      "a list the next release already holds",
      async (w: ReturnType<typeof world>) => {
        w.tipHolds(["tdd"], {
          files: {
            [FILE]: "version: 1\ncategories: [Planning]\nassignments: []\n",
          },
        });
        await w.own(["Planning"]);
      },
      "list-unchanged",
    ],
    [
      "another contributor's open pull request",
      async (w: ReturnType<typeof world>) => {
        await w.own(["Planning"]);
        w.review.answer(answered([request({ author: "mira" })]));
      },
      "proposed-by-other",
    ],
    [
      "GitHub that could not be read",
      async (w: ReturnType<typeof world>) => {
        await w.own(["Planning"]);
        w.review.answer({ outcome: "failed" });
      },
      "no-answer",
    ],
  ])("refuses %s on confirm, pushing nothing", async (_, arrange, error) => {
    const w = world();
    w.tipHolds(["tdd"]);
    await arrange(w);

    expect(await w.submit()).toEqual({ status: 409, body: { error } });
    expect(w.harness.listPushes).toEqual([]);
    expect(w.review.created).toEqual([]);
  });

  it.each([
    ["push-failed", 502, "promote-failed"],
    ["offline", 409, "no-answer"],
    ["push-elsewhere", 422, "push-elsewhere"],
  ] as const)(
    "reports a push that answered %s",
    async (outcome, status, error) => {
      const { tipHolds, own, harness, review, submit } = world();
      tipHolds(["tdd"]);
      await own(["Planning"]);
      harness.pushOutcomes["list.categories"] = outcome;

      expect(await submit()).toEqual({ status, body: { error } });
      expect(review.created).toEqual([]);
    },
  );

  it("reports a pushed branch that GitHub opened no pull request for", async () => {
    const { tipHolds, own, review, submit } = world();
    tipHolds(["tdd"]);
    await own(["Planning"]);
    review.answerWrite({ ok: false, error: "failed" });

    expect(await submit()).toEqual({
      status: 200,
      body: { pullRequest: { state: "missing", gh: "available" } },
    });
  });
});
