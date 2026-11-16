// The categories pull request after a close without merging, over HTTP, over
// an in-memory disk, Harness and GitHub.
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
  world,
} from "../helpers/categories-proposal-world";

const LEAF = "list.categories";

// The operator's list, and a branch whose pull request #45 was closed.
const closedWorld = async (
  over: Parameters<typeof request>[0] = {},
): Promise<ReturnType<typeof world>> => {
  const w = world();
  w.tipHolds(["tdd"]);
  w.harness.commit(
    "closed-45",
    { tdd: "# tdd\n" },
    {
      parent: "tip",
      files: {
        [FILE]: "version: 1\ncategories: [Old]\nassignments: []\n",
      },
    },
  );
  w.harness.promote[LEAF] = "closed-45";
  w.review.answer(
    answered([
      request({
        number: 45,
        url: `${PULL}/45`,
        state: "closed",
        headCommit: "closed-45",
        ...over,
      }),
    ]),
  );
  await w.own(["Planning"]);
  return w;
};

describe("the pull-request row after a close without merging", () => {
  it("states the operator's own closed pull request", async () => {
    const { row } = await closedWorld();

    expect(await row()).toEqual({
      status: 200,
      body: {
        state: "closed",
        number: 45,
        url: `${PULL}/45`,
        author: "fimoklei",
        byOther: false,
        list: "ready",
      } satisfies CategoriesProposalRow,
    });
  });

  it("states another contributor's closed pull request without blocking", async () => {
    const { row } = await closedWorld({ author: "mira" });

    expect((await row()).body).toMatchObject({
      state: "closed",
      author: "mira",
      byOther: true,
      list: "ready",
    });
  });

  it("keeps the closed sentence and blocks an empty list", async () => {
    const w = world();
    w.tipHolds(["tdd"]);
    w.harness.commit(
      "closed-45",
      {},
      {
        parent: "tip",
        files: { [FILE]: "version: 1\ncategories: [Old]\nassignments: []\n" },
      },
    );
    w.harness.promote[LEAF] = "closed-45";
    w.review.answer(
      answered([request({ number: 45, state: "closed", headCommit: "x" })]),
    );

    expect((await w.row()).body).toMatchObject({
      state: "closed",
      list: "empty",
    });
  });

  it("returns to the start once the branch is deleted", async () => {
    const { harness, row } = await closedWorld();
    delete harness.promote[LEAF];

    expect((await row()).body).toEqual({ state: "start" });
  });
});

describe("the dialog after a close without merging", () => {
  it("says Maestro deletes the branch when every commit on it is the operator's", async () => {
    const { preview } = await closedWorld();

    expect(await preview()).toEqual({
      status: 200,
      body: {
        kind: "after-close",
        number: 45,
        deletesBranch: true,
        difference: {
          kind: "changes",
          added: [{ name: "Planning", skills: 0, prompts: 0 }],
          deleted: [],
          moved: [],
        },
      } satisfies CategoriesProposalPreview,
    });
  });

  it.each(["others", "no-email", "unknown"] as const)(
    "keeps the branch when its authorship reads %s",
    async (authorship) => {
      const w = await closedWorld();
      w.harness.authorship[LEAF] = authorship;

      expect((await w.preview()).body).toMatchObject({
        kind: "after-close",
        deletesBranch: false,
      });
    },
  );
});

describe("Create pull request after a close without merging", () => {
  it("deletes the old branch, pushes a new one from the tip, and opens a new pull request", async () => {
    const { harness, review, submit } = await closedWorld();

    expect(await submit()).toEqual({
      status: 200,
      body: {
        pullRequest: { state: "opened", number: 101, url: `${PULL}/101` },
      },
    });
    expect(harness.deletedBranches).toEqual([BRANCH]);
    expect(harness.listPushes.map(({ parents }) => parents)).toEqual([["tip"]]);
    expect(review.reopened).toEqual([]);
    expect(review.created).toMatchObject([{ head: BRANCH }]);
  });

  it("stacks a commit where the branch holds another author's commits", async () => {
    const { harness, review, submit } = await closedWorld({ author: "mira" });
    harness.authorship[LEAF] = "others";

    expect((await submit()).status).toBe(200);
    expect(harness.deletedBranches).toEqual([]);
    expect(harness.listPushes.map(({ parents }) => parents)).toEqual([
      ["closed-45"],
    ]);
    expect(review.reopened).toEqual([]);
    expect(review.created).toHaveLength(1);
  });

  it("reports a push that failed after the delete", async () => {
    const { harness, review, submit } = await closedWorld();
    harness.pushOutcomes[LEAF] = "push-failed";

    expect(await submit()).toEqual({
      status: 502,
      body: { error: "push-failed-after-delete" },
    });
    expect(harness.deletedBranches).toEqual([BRANCH]);
    expect(review.created).toEqual([]);
  });

  it("pushes nothing when the old branch could not be deleted", async () => {
    const { harness, review, submit } = await closedWorld();
    harness.deleteOutcome = "failed";

    expect(await submit()).toEqual({
      status: 502,
      body: { error: "promote-failed" },
    });
    expect(harness.listPushes).toEqual([]);
    expect(review.created).toEqual([]);
  });
});
