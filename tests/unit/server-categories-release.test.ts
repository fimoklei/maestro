// A merged categories list on its way to teammates, over HTTP: the Categories
// row under Pending release, the row on Categories in Settings, and a release
// whose only change is the list, over an in-memory disk, Harness and GitHub.
import type {
  ApmDriverPort,
  CategoriesProposalRow,
  HarnessCategories,
  HarnessReviewRead,
  HarnessStageRow,
  HarnessState,
  ReleasePlan,
  ReviewRequest,
} from "@maestro/core";
import { describe, expect, it } from "vitest";
import { InMemoryHarnessGit } from "../../packages/core/src/harness/harness-git.fake";
import { InMemoryFileSystem } from "../../packages/core/src/registry/file-system.fake";
import { inMemoryApp, unreachable } from "../helpers/in-memory-app";
import { stubReview } from "../helpers/stub-review";

const HARNESS = "/harness";
const REPO = "/work/app";
const FILE = ".maestro/categories.yml";
const BRANCH = "maestro/list.categories";
const PULL = "https://github.com/fimoklei/agent-harness/pull";
const RELEASED = "version: 1\ncategories: [Writing]\nassignments: []\n";
const MERGED =
  "version: 1\ncategories: [Planning, Review, Writing]\nassignments: []\n";

const merged = (over: Partial<ReviewRequest> = {}): ReviewRequest => ({
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

// v1.0.0 holds `released`; one merged commit on main holds `merged`. The
// clone already holds that commit, so nothing waits for a proposal.
const world = (
  released: string | null,
  merged: string | null,
  skills: Record<string, string> = { tdd: "# tdd\n" },
) => {
  const env: NodeJS.ProcessEnv = {
    HOME: "/home",
    MAESTRO_HOME: "/maestro-home",
    MAESTRO_INVENTORY_PATH: HARNESS,
  };
  const fs = new InMemoryFileSystem({
    directories: { [HARNESS]: HARNESS, [REPO]: REPO },
    files: {
      [`${REPO}/.git`]: "gitdir: elsewhere",
      // The target holds tdd at the latest release.
      [`${REPO}/apm.lock.yaml`]:
        "lockfile_version: '1'\ndependencies:\n- repo_url: fimoklei/agent-harness\n  host: github.com\n  resolved_ref: v1.0.0\n  virtual_path: .apm/skills/tdd\n  package_type: claude_skill\n",
    },
  });
  const harness = new InMemoryHarnessGit();
  const files = (text: string | null): Record<string, string> =>
    text === null ? {} : { [FILE]: text };
  harness.commit("released", { tdd: "# tdd\n" }, { files: files(released) });
  harness.tags = [{ name: "v1.0.0", commit: "released" }];
  harness.commit("merged", skills, {
    parent: "released",
    author: "teammate",
    files: files(merged),
  });
  harness.tip = "merged";
  harness.head = "merged";
  harness.working = { ...skills };
  const review = stubReview();
  const app = inMemoryApp({
    env,
    fs,
    git: { harness },
    gh: review,
    // apm sees only that a newer tag exists; Maestro reads the content.
    apm: unreachable<ApmDriverPort>("apm", {
      checkOutdated: async () => ({
        ok: true,
        behind: [{ name: "tdd", current: "v1.0.0", latest: "v1.0.1" }],
      }),
    }),
  });
  const post = (path: string, body: unknown) =>
    app.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  // A refresh fetches first: only a confirmed fetch gives the tags meaning.
  const state = async (): Promise<HarnessState> =>
    (await (await post("/api/harness/refresh", {})).json()) as HarnessState;
  const releaseRows = async (): Promise<HarnessStageRow[]> => {
    const read = (await state()).stages.release;
    return read.outcome === "read" ? read.rows : [];
  };
  const plan = async (): Promise<ReleasePlan> => {
    await state();
    return (await (
      await app.request("/api/harness/release-plan")
    ).json()) as ReleasePlan;
  };
  return { app, harness, review, post, state, releaseRows, plan };
};

describe("the Categories row under Pending release", () => {
  it("shows a merged categories change as one row of type categories", async () => {
    const { review, releaseRows } = world(RELEASED, MERGED);
    review.answer(answered([merged()]));

    expect(await releaseRows()).toEqual([
      expect.objectContaining({
        stage: "pending-release",
        type: "categories",
        path: FILE,
        status: "not-yet-released",
        change: "edit",
        mergedRequest: 45,
        openRequests: [],
      } satisfies Partial<HarnessStageRow>),
    ]);
  });

  it.each([
    ["Added where the latest release holds no file", null, MERGED, "addition"],
    ["Deleted where the file was removed by hand", RELEASED, null, "deletion"],
  ] as const)("reads %s", async (_, released, onMain, change) => {
    const { releaseRows } = world(released, onMain);

    expect(await releaseRows()).toEqual([
      expect.objectContaining({ type: "categories", change }),
    ]);
  });

  it("shows no row where the default branch holds the released file", async () => {
    const { releaseRows } = world(RELEASED, RELEASED);

    expect(await releaseRows()).toEqual([]);
  });
});

describe("the row on Categories in Settings after the merge", () => {
  const row = async (w: ReturnType<typeof world>) =>
    (await (
      await w.app.request("/api/categories/proposal")
    ).json()) as CategoriesProposalRow;

  it("reads merged and not released while the Categories row is under Pending release", async () => {
    const w = world(RELEASED, MERGED);
    w.review.answer(answered([merged()]));
    await w.post("/api/categories", { name: "Planning" });

    expect(await row(w)).toEqual({
      state: "merged-not-released",
      number: 45,
      url: `${PULL}/45`,
      list: "ready",
    } satisfies CategoriesProposalRow);
  });

  it("keeps the merged state with an empty list, and refuses to propose it", async () => {
    const w = world(RELEASED, MERGED);
    w.review.answer(answered([merged()]));

    const shown = await row(w);
    const created = await w.post("/api/categories/proposal", {});

    expect(shown).toMatchObject({
      state: "merged-not-released",
      list: "empty",
    });
    expect({ status: created.status, body: await created.json() }).toEqual({
      status: 409,
      body: { error: "list-empty" },
    });
  });

  it("reads the start state once the merged list is released", async () => {
    const w = world(RELEASED, MERGED);
    w.harness.tags = [
      { name: "v1.0.0", commit: "released" },
      { name: "v1.0.1", commit: "merged" },
    ];
    w.review.answer(answered([merged()]));
    await w.post("/api/categories", { name: "Planning" });

    expect(await row(w)).toEqual({ state: "start" });
  });
});

describe("a release whose only change is the categories", () => {
  it("proposes a patch step and lists the change with its author", async () => {
    const { plan } = world(RELEASED, MERGED);

    const planned = await plan();

    expect({
      delta: planned.delta,
      step: planned.proposedStep,
      patch: planned.versions.patch,
      blocked: planned.blocked,
    }).toEqual({
      delta: [
        {
          type: "categories",
          name: "categories",
          kind: "changed",
          change: "edit",
          author: "teammate",
        },
      ],
      step: "patch",
      patch: "v1.0.1",
      blocked: null,
    });
  });

  it("publishes it, leaves the target Behind with no changed skill, and serves the new count", async () => {
    const { plan, post, app, releaseRows } = world(RELEASED, MERGED);
    const planned = await plan();

    const published = await post("/api/harness/release", {
      step: planned.proposedStep,
      previousTag: planned.previousTag,
      previousTagCommit: planned.previousTagCommit,
      revision: planned.revision,
    });
    await post("/api/registry/repos", { path: REPO });
    const drift = await (
      await app.request(`/api/drift?repo=${encodeURIComponent(REPO)}`)
    ).json();
    const harness = (await (
      await app.request("/api/categories/harness")
    ).json()) as HarnessCategories;

    expect(await published.json()).toEqual({
      tag: "v1.0.1",
      revision: "merged",
    });
    // older-tag: the target lags a release in which tdd's content never moved.
    expect(drift).toEqual({
      behind: [
        {
          name: "tdd",
          current: "v1.0.0",
          latest: "v1.0.1",
          reading: "older-tag",
        },
      ],
    });
    expect(harness).toMatchObject({ kind: "listed", tag: "v1.0.1", count: 3 });
    expect(await releaseRows()).toEqual([]);
  });
});
