// Withdraw from release on the Categories row, over HTTP: one commit makes the
// default-branch file equal to the latest release's, over an in-memory disk,
// Harness and GitHub.
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
const BRANCH = "maestro/list.categories";
const PULL = "https://github.com/fimoklei/agent-harness/pull";
const RELEASED = "version: 1\ncategories: [Writing]\nassignments: []\n";
const MERGED =
  "version: 1\ncategories: [Planning, Review, Writing]\nassignments: []\n";

const pull = (over: Partial<ReviewRequest>): ReviewRequest => ({
  number: 45,
  url: `${PULL}/45`,
  state: "merged",
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

// v1.0.0 holds `released`; one merged commit on main holds `merged`.
const world = (released: string | null, merged: string | null) => {
  const fs = new InMemoryFileSystem({
    directories: { [HARNESS]: HARNESS },
  });
  const harness = new InMemoryHarnessGit();
  const files = (text: string | null): Record<string, string> =>
    text === null ? {} : { [FILE]: text };
  harness.commit("released", { tdd: "# tdd\n" }, { files: files(released) });
  harness.tags = [{ name: "v1.0.0", commit: "released" }];
  harness.commit(
    "merged",
    { tdd: "# tdd\n" },
    { parent: "released", author: "teammate", files: files(merged) },
  );
  harness.tip = "merged";
  harness.head = "merged";
  harness.working = { tdd: "# tdd\n" };
  const review = stubReview();
  const app = inMemoryApp({
    env: {
      HOME: "/home",
      MAESTRO_HOME: "/maestro-home",
      MAESTRO_INVENTORY_PATH: HARNESS,
    },
    fs,
    git: { harness },
    gh: review,
  });
  const post = async (path: string, body: unknown) => {
    const res = await app.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  const state = async (): Promise<HarnessState> =>
    (await post("/api/harness/refresh", {})).body as HarnessState;
  const releaseRows = async (): Promise<HarnessStageRow[]> => {
    const read = (await state()).stages.release;
    return read.outcome === "read" ? read.rows : [];
  };
  const check = () =>
    post("/api/harness/release/withdraw/check", { type: "categories" });
  // Reads the confirmation, then presses with it.
  const withdraw = async () => {
    await state();
    const checked = await check();
    expect(checked).toEqual({
      status: 200,
      body: { confirmation: expect.any(String) },
    });
    return post("/api/harness/release/withdraw", {
      type: "categories",
      confirmation: (checked.body as { confirmation: string }).confirmation,
    });
  };
  const fileOnMain = async () => {
    const read = await harness.readFileAt(
      HARNESS,
      harness.tip ?? "",
      FILE,
      1_000_000,
    );
    return read?.kind === "text" ? read.text : read?.kind;
  };
  return {
    app,
    harness,
    review,
    post,
    state,
    releaseRows,
    check,
    withdraw,
    fileOnMain,
  };
};

describe("Withdraw from release on the Categories row", () => {
  it("makes the default-branch file equal to the latest release's file", async () => {
    const w = world(RELEASED, MERGED);
    w.review.answer(answered([pull({})]));

    const pressed = await w.withdraw();

    expect(pressed).toEqual({ status: 200, body: { name: "categories" } });
    expect(await w.fileOnMain()).toBe(RELEASED);
    expect(await w.releaseRows()).toEqual([]);
  });

  it("removes the file where the latest release has none", async () => {
    const w = world(null, MERGED);

    await w.withdraw();

    expect(await w.fileOnMain()).toBe("absent");
  });

  it("brings back a file removed by hand", async () => {
    const w = world(RELEASED, null);

    await w.withdraw();

    expect(await w.fileOnMain()).toBe(RELEASED);
  });

  it("copies a released file with an error as it is", async () => {
    const faulty = "version: [\n";
    const w = world(faulty, MERGED);

    const pressed = await w.withdraw();

    expect(pressed.status).toBe(200);
    expect(await w.fileOnMain()).toBe(faulty);
  });

  it("names the merged pull request in the commit and sends the proposer nothing", async () => {
    const w = world(RELEASED, MERGED);
    w.review.answer(answered([pull({})]));

    await w.withdraw();

    expect(w.harness.withdrawals.map((each) => each.message)).toEqual([
      "Withdraw Harness categories\n\nTakes pull request #45 out of the next release.",
    ]);
    expect({
      created: w.review.created,
      closed: w.review.closed,
      edited: w.review.edited,
      reopened: w.review.reopened,
    }).toEqual({ created: [], closed: [], edited: [], reopened: [] });
  });

  it("leaves the row on Categories in Settings at its start state", async () => {
    const w = world(RELEASED, MERGED);
    w.review.answer(answered([pull({})]));
    await w.post("/api/categories", { name: "Planning" });

    await w.withdraw();
    await w.state();
    const row = (await (
      await w.app.request("/api/categories/proposal")
    ).json()) as CategoriesProposalRow;

    expect(row).toEqual({ state: "start" });
  });
});

describe("Withdraw from release on the Categories row is blocked", () => {
  it.each([
    ["the operator's own categories pull request is open", "fimoklei", false],
    ["another contributor's categories pull request is open", "mira", true],
  ])("while %s, and the row says whose", async (_, author, byOther) => {
    const w = world(RELEASED, MERGED);
    w.review.answer(
      answered([
        pull({}),
        pull({ number: 46, url: `${PULL}/46`, state: "open", author }),
      ]),
    );

    const rows = await w.releaseRows();
    const checked = await w.check();

    expect(rows).toEqual([
      expect.objectContaining({
        type: "categories",
        openRequests: [46],
        openByOther: byOther,
      }),
    ]);
    expect(checked).toEqual({ status: 409, body: { error: "proposal-open" } });
    expect(await w.fileOnMain()).toBe(MERGED);
  });

  it("while GitHub could not be read", async () => {
    const w = world(RELEASED, MERGED);
    w.review.answer({ outcome: "failed" });

    const rows = await w.releaseRows();
    const checked = await w.check();

    expect(rows).toEqual([
      expect.objectContaining({ type: "categories", openRequests: null }),
    ]);
    expect(checked).toEqual({ status: 409, body: { error: "proposal-open" } });
  });

  it("at the press, when a pull request opened after the confirmation", async () => {
    const w = world(RELEASED, MERGED);
    await w.state();
    const checked = await w.check();
    w.review.answer(answered([pull({ number: 46, state: "open" })]));
    await w.state();

    const pressed = await w.post("/api/harness/release/withdraw", {
      type: "categories",
      confirmation: (checked.body as { confirmation: string }).confirmation,
    });

    expect(pressed).toEqual({ status: 409, body: { error: "proposal-open" } });
    expect(w.harness.withdrawals).toEqual([]);
  });
});
