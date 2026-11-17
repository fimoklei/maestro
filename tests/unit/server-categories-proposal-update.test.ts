// Update pull request: the row, the dialog's difference and the write while
// the operator's own categories pull request is open.
import type {
  CategoriesProposalPreview,
  CategoriesProposalRow,
} from "@maestro/core";
import { describe, expect, it } from "vitest";
import {
  answered,
  BRANCH,
  FILE,
  PULL,
  request,
  skill,
  world,
} from "../helpers/categories-proposal-world";

const LEAF = "list.categories";

// The tip holds tdd and debug; the operator's pull request #45 carries `text`.
const opened = (text: string) => {
  const w = world();
  w.tipHolds(["tdd", "debug"]);
  w.harness.commit(
    "pr",
    { tdd: "# tdd\n", debug: "# debug\n" },
    { parent: "tip", files: { [FILE]: text } },
  );
  w.harness.promote[LEAF] = "pr";
  w.review.answer(answered([request({ number: 45, url: `${PULL}/45` })]));
  return w;
};

const PLANNING = [
  "version: 1",
  "categories:",
  "  - Planning",
  "assignments:",
  "  - type: skill",
  "    name: tdd",
  "    category: Planning",
  "",
].join("\n");

describe("the row while the operator's own pull request is open", () => {
  it("says the list differs from the file on the pull request's branch", async () => {
    const w = opened(PLANNING);
    await w.own(
      ["Planning", "Review"],
      [{ ...skill("tdd"), category: "Planning" }],
    );

    expect((await w.row()).body).toEqual({
      state: "own-open",
      status: "waiting-for-review",
      number: 45,
      url: `${PULL}/45`,
      list: "differs",
    } satisfies CategoriesProposalRow);
  });

  it("says nothing differs when the list equals the file, as the writer would write it", async () => {
    // Another spelling of the same list: flow style, unheld item, other order.
    const w = opened(
      [
        "version: 1",
        "categories: [Planning]",
        "assignments:",
        "  - { type: skill, name: gone, category: Planning }",
        "  - { type: skill, name: tdd, category: Planning }",
        "",
      ].join("\n"),
    );
    await w.own(["Planning"], [{ ...skill("tdd"), category: "Planning" }]);

    expect((await w.row()).body).toMatchObject({
      state: "own-open",
      list: "same",
    });
  });

  it("keeps the pull request's state for an empty list and blocks it", async () => {
    const w = opened(PLANNING);

    expect((await w.row()).body).toMatchObject({
      state: "own-open",
      number: 45,
      list: "empty",
    });
  });

  it("blocks a list over 200 categories", async () => {
    const w = opened(PLANNING);
    await w.own(Array.from({ length: 201 }, (_, at) => `C${at}`));

    expect((await w.row()).body).toMatchObject({ list: "over-limits" });
  });

  it("counts the pull request as the operator's own by GitHub login, on any computer", async () => {
    const w = opened(PLANNING);
    await w.own(["Planning"]);
    w.review.answerViewer({ outcome: "read", login: "FimoKlei" });

    expect((await w.row()).body).toMatchObject({ state: "own-open" });
  });

  it("is unread when the pull request's branch could not be read", async () => {
    const w = opened(PLANNING);
    await w.own(["Planning"]);
    w.harness.unreadable.add("pr");

    expect((await w.row()).body).toEqual({ state: "unread" });
  });
});

describe("the Update pull request dialog's difference", () => {
  it("compares with the file on the pull request's branch and warns against the next release", async () => {
    const w = world();
    w.tipHolds(["tdd", "debug"], {
      files: {
        [FILE]:
          "version: 1\ncategories: [Debugging]\nassignments:\n  - { type: skill, name: debug, category: Debugging }\n",
      },
    });
    w.harness.commit(
      "pr",
      { tdd: "# tdd\n", debug: "# debug\n" },
      { parent: "tip", files: { [FILE]: PLANNING } },
    );
    w.harness.promote[LEAF] = "pr";
    w.review.answer(answered([request({ number: 45, url: `${PULL}/45` })]));
    await w.own(
      ["Planning", "Review"],
      [{ ...skill("debug"), category: "Review" }],
    );

    expect(await w.preview()).toEqual({
      status: 200,
      body: {
        kind: "update",
        number: 45,
        difference: {
          kind: "changes",
          added: [{ name: "Review", skills: 1, prompts: 0 }],
          deleted: [],
          moved: [{ type: "skill", name: "tdd", category: null }],
        },
        deleted: [{ name: "Debugging", skills: 0, prompts: 0 }],
      } satisfies CategoriesProposalPreview,
    });
  });

  it("says the list equals the pull request", async () => {
    const w = opened(PLANNING);
    await w.own(["Planning"], [{ ...skill("tdd"), category: "Planning" }]);

    expect((await w.preview()).body).toEqual({
      kind: "update",
      number: 45,
      difference: { kind: "unchanged" },
      deleted: [],
    });
  });

  it("cannot compare with a pull-request file that has an error", async () => {
    const w = opened("categories: [\n");
    await w.own(["Planning"]);

    expect((await w.preview()).body).toMatchObject({
      kind: "update",
      difference: { kind: "uncompared" },
    });
  });
});

describe("Update pull request", () => {
  it("adds one commit with the current list to the same branch", async () => {
    const w = opened(PLANNING);
    await w.own(
      ["Planning", "Review"],
      [{ ...skill("tdd"), category: "Review" }],
    );

    expect(await w.submit()).toEqual({
      status: 200,
      body: {
        pullRequest: { state: "updated", number: 45, url: `${PULL}/45` },
      },
    });
    expect(w.harness.listPushes).toEqual([
      {
        branch: BRANCH,
        parents: ["pr"],
        text: [
          "version: 1",
          "categories:",
          "  - Planning",
          "  - Review",
          "assignments:",
          "  - type: skill",
          "    name: tdd",
          "    category: Review",
          "",
        ].join("\n"),
      },
    ]);
    expect(w.review.created).toEqual([]);
  });

  it.each([
    ["a list equal to the pull request", ["Planning"], "request-unchanged"],
    ["an empty list", [], "list-empty"],
  ] as const)(
    "refuses %s on confirm, pushing nothing",
    async (_, names, error) => {
      const w = opened(PLANNING);
      await w.own(
        [...names],
        names.length === 0 ? [] : [{ ...skill("tdd"), category: "Planning" }],
      );

      expect(await w.submit()).toEqual({ status: 409, body: { error } });
      expect(w.harness.listPushes).toEqual([]);
    },
  );

  it("refuses when the pull request closed while the dialog stood, deleting and pushing nothing", async () => {
    const w = opened(PLANNING);
    await w.own(
      ["Planning", "Review"],
      [{ ...skill("tdd"), category: "Review" }],
    );
    w.review.answer(
      answered([
        request({
          number: 45,
          url: `${PULL}/45`,
          state: "closed",
          headCommit: "pr",
        }),
      ]),
    );

    expect(await w.submit("update")).toEqual({
      status: 409,
      body: { error: "proposal-changed" },
    });
    expect(w.harness.deletedBranches).toEqual([]);
    expect(w.harness.listPushes).toEqual([]);
    expect(w.review.created).toEqual([]);
  });
});
