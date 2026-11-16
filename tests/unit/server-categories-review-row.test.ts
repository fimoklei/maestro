// The Categories row under Pending review over HTTP: its stage, its Change and
// Withdraw proposal, over an in-memory disk, Harness and GitHub.
import type {
  CategoriesProposalRow,
  HarnessReviewRead,
  HarnessStageRow,
  HarnessState,
  ReviewRequest,
} from "@maestro/core";
import { describe, expect, it } from "vitest";
import { InMemoryHarnessGit } from "../../packages/core/src/harness/harness-git.fake";
import { InMemoryFileSystem } from "../../packages/core/src/registry/file-system.fake";
import { inMemoryApp } from "../helpers/in-memory-app";
import { stubReview } from "../helpers/stub-review";

const HARNESS = "/harness";
const FILE = ".maestro/categories.yml";
const LEAF = "list.categories";
const BRANCH = `maestro/${LEAF}`;
const PULL = "https://github.com/fimoklei/agent-harness/pull";
const LIST = "version: 1\ncategories: [Planning]\nassignments: []\n";

const request = (over: Partial<ReviewRequest> = {}): ReviewRequest => ({
  number: 45,
  url: `${PULL}/45`,
  state: "open",
  draft: false,
  decision: null,
  reviewers: [],
  headOwner: "fimoklei",
  headRepo: "agent-harness",
  headBranch: BRANCH,
  headCommit: "branch",
  baseBranch: "main",
  author: "fimoklei",
  title: "Set Harness categories",
  ...over,
});

const answered = (requests: ReviewRequest[]): HarnessReviewRead => ({
  outcome: "read",
  requests,
  complete: true,
  limit: 100,
});

const world = () => {
  const env: NodeJS.ProcessEnv = {
    HOME: "/home",
    MAESTRO_HOME: "/maestro-home",
    MAESTRO_INVENTORY_PATH: HARNESS,
  };
  const fs = new InMemoryFileSystem({ directories: { [HARNESS]: HARNESS } });
  const harness = new InMemoryHarnessGit();
  const review = stubReview();
  const app = inMemoryApp({ env, fs, git: { harness }, gh: review });
  // The default branch, the clone and the latest release agree.
  const tipHolds = (files: Record<string, string> = {}) => {
    harness.commit("tip", { tdd: "# tdd\n" }, { files });
    harness.tip = "tip";
    harness.head = "tip";
    harness.working = { tdd: "# tdd\n" };
    harness.tags = [{ name: "v1.0.0", commit: "tip" }];
  };
  // The categories branch, pushed on the tip with this file.
  const branchHolds = (text: string | null) => {
    const files: Record<string, string> = text === null ? {} : { [FILE]: text };
    harness.commit("branch", { tdd: "# tdd\n" }, { parent: "tip", files });
    harness.promote[LEAF] = "branch";
  };
  // The server's own answer type, as the stages helper reads it.
  const state = async (): Promise<HarnessState> =>
    (await (await app.request("/api/harness")).json()) as HarnessState;
  const reviewRows = async (): Promise<HarnessStageRow[]> => {
    const read = (await state()).stages.review;
    return read.outcome === "read" ? read.rows : [];
  };
  const post = (path: string, body: unknown) =>
    app.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  return {
    app,
    harness,
    review,
    tipHolds,
    branchHolds,
    state,
    reviewRows,
    post,
  };
};

describe("the Categories row under Pending review", () => {
  it("shows an open categories pull request as one row of type categories", async () => {
    const { tipHolds, branchHolds, review, reviewRows } = world();
    tipHolds();
    branchHolds(LIST);
    review.answer(answered([request()]));

    expect(await reviewRows()).toEqual([
      expect.objectContaining({
        stage: "pending-review",
        type: "categories",
        path: FILE,
        branch: BRANCH,
        status: "waiting-for-review",
        change: "addition",
        requests: [expect.objectContaining({ number: 45, url: `${PULL}/45` })],
      } satisfies Partial<HarnessStageRow>),
    ]);
  });

  it("reads Changed where the next release holds a categories file", async () => {
    const { tipHolds, branchHolds, review, reviewRows } = world();
    tipHolds({
      [FILE]: "version: 1\ncategories: [Writing]\nassignments: []\n",
    });
    branchHolds(LIST);
    review.answer(answered([request()]));

    expect((await reviewRows()).map((row) => row.change)).toEqual(["edit"]);
  });

  it("reads Deleted where the branch removes the categories file", async () => {
    const { tipHolds, branchHolds, review, reviewRows } = world();
    tipHolds({ [FILE]: LIST });
    branchHolds(null);
    review.answer(answered([request()]));

    expect((await reviewRows()).map((row) => row.change)).toEqual(["deletion"]);
  });

  it("reads Pull request missing for a pushed branch with no pull request", async () => {
    const { tipHolds, branchHolds, reviewRows } = world();
    tipHolds();
    branchHolds(LIST);

    expect(await reviewRows()).toEqual([
      expect.objectContaining({
        type: "categories",
        status: "pull-request-missing",
        requests: [],
        ownsBranch: true,
      }),
    ]);
  });

  it("shows no row for a branch that holds the next release's file", async () => {
    const { tipHolds, branchHolds, reviewRows } = world();
    tipHolds({ [FILE]: LIST });
    branchHolds(LIST);

    expect(await reviewRows()).toEqual([]);
  });

  it("never shows the list under Pending proposal", async () => {
    const { tipHolds, branchHolds, state } = world();
    tipHolds();
    branchHolds(LIST);

    const proposal = (await state()).stages.proposal;
    expect(proposal.outcome === "read" ? proposal.rows : null).toEqual([]);
  });
});

describe("the row on Categories in Settings follows the Harness row", () => {
  it("reads Pull request missing while the Harness row does, and offers to finish it", async () => {
    const w = world();
    w.tipHolds();
    w.branchHolds(LIST);
    await w.post("/api/categories", { name: "Planning" });

    const row = await (await w.app.request("/api/categories/proposal")).json();
    const created = await w.post("/api/categories/proposal", {});

    expect(row).toEqual({
      state: "pull-request-missing",
    } satisfies CategoriesProposalRow);
    expect(created.status).toBe(200);
    expect(w.review.created).toMatchObject([{ head: BRANCH, base: "main" }]);
  });

  it("reads the start state where the Harness shows no row for the branch", async () => {
    const w = world();
    w.tipHolds({ [FILE]: LIST });
    w.branchHolds(LIST);
    await w.post("/api/categories", { name: "Writing" });

    const row = await (await w.app.request("/api/categories/proposal")).json();

    expect(await w.reviewRows()).toEqual([]);
    expect(row).toEqual({ state: "start" });
  });
});

describe("Withdraw proposal on the Categories row", () => {
  it("closes the open pull request and deletes the branch", async () => {
    const { tipHolds, branchHolds, review, harness, post } = world();
    tipHolds();
    branchHolds(LIST);
    review.answer(answered([request()]));

    const res = await post("/api/harness/proposal/withdraw", {
      type: "categories",
      number: 45,
    });

    expect({ status: res.status, body: await res.json() }).toEqual({
      status: 200,
      body: { ok: true },
    });
    expect(review.closed).toEqual([45]);
    expect(harness.deletedBranches).toEqual([BRANCH]);
  });

  it("deletes a branch that has no pull request", async () => {
    const { tipHolds, branchHolds, review, harness, post } = world();
    tipHolds();
    branchHolds(LIST);

    const res = await post("/api/harness/proposal/withdraw", {
      type: "categories",
      number: null,
    });

    expect(res.status).toBe(200);
    expect(review.closed).toEqual([]);
    expect(harness.deletedBranches).toEqual([BRANCH]);
  });
});
