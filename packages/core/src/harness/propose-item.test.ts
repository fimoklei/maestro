import { describe, expect, it } from "vitest";
import { harnessDisk } from "./harness-disk.fake";
import { HarnessFetchGate } from "./harness-fetch-gate";
import { InMemoryHarnessGit, skillRef, treeHash } from "./harness-git.fake";
import type {
  HarnessReviewPort,
  HarnessReviewRead,
  ReviewRequest,
} from "./harness-review-port";
import { proposeChange, proposeDeletion } from "./propose-item";

const TDD = "---\ndescription: Test first.\n---\n";

const readOf = (requests: ReviewRequest[]): HarnessReviewRead => ({
  outcome: "read",
  requests,
  complete: true,
  limit: 100,
});

const openRequest: ReviewRequest = {
  number: 45,
  url: "https://github.com/fimoklei/agent-harness/pull/45",
  state: "open",
  draft: false,
  decision: null,
  reviewers: [],
  headOwner: "fimoklei",
  headRepo: "agent-harness",
  headBranch: "maestro/tdd",
  headCommit: "3d0f1a9c5b7e2846f0a1c3d5e7b9081726354adf",
  baseBranch: "main",
  author: "fimoklei",
  title: "Delete skill: tdd",
};

const review = (read: HarnessReviewRead): HarnessReviewPort => ({
  readReviews: async () => read,
  readViewer: async () => ({ outcome: "read", login: "fimoklei" }),
  createRequest: async () => ({
    ok: true,
    number: 52,
    url: "https://github.com/fimoklei/agent-harness/pull/52",
  }),
  reopenRequest: async () => ({ ok: true }),
  closeRequest: async () => ({ ok: true }),
  editRequest: async () => ({ ok: true }),
});

const depsFor = (git: InMemoryHarnessGit, read: HarnessReviewRead) => ({
  fs: harnessDisk(),
  git,
  fetchGate: new HarnessFetchGate({
    git,
    freshness: {
      read: async () => ({
        outcome: "fetched",
        lastFetchedAt: "2026-08-01T07:00:00.000Z",
      }),
      record: async () => {},
    },
    now: () => new Date("2026-08-09T12:00:00.000Z"),
    fetched: () => {},
  }),
  review: review(read),
});

describe("proposing one item", () => {
  it("answers a pushed change with the request it opened", async () => {
    const git = new InMemoryHarnessGit().settled({}, "head");
    git.working = { tdd: "mine" };

    await expect(
      proposeChange(depsFor(git, readOf([])), "/harness", skillRef("tdd")),
    ).resolves.toEqual({
      ok: true,
      branch: "maestro/tdd",
      pullRequestUrl:
        "https://github.com/fimoklei/agent-harness/compare/main...maestro/tdd?expand=1",
      pullRequest: {
        state: "opened",
        number: 52,
        url: "https://github.com/fimoklei/agent-harness/pull/52",
      },
    });
  });

  it("answers a pushed change with a missing request when gh is absent", async () => {
    const git = new InMemoryHarnessGit().settled({}, "head");
    git.working = { tdd: "mine" };

    await expect(
      proposeChange(
        depsFor(git, { outcome: "unavailable", reason: "no-gh" }),
        "/harness",
        skillRef("tdd"),
      ),
    ).resolves.toMatchObject({ ok: true, pullRequest: { state: "missing" } });
  });

  it("answers a pushed deletion with the open request it updated", async () => {
    const git = new InMemoryHarnessGit().settled({ tdd: TDD }, "head");
    git.working = {};

    await expect(
      proposeDeletion(
        depsFor(git, readOf([openRequest])),
        "/harness",
        skillRef("tdd"),
        treeHash(TDD),
      ),
    ).resolves.toMatchObject({
      ok: true,
      branch: "maestro/tdd",
      pullRequest: {
        state: "updated",
        number: 45,
        url: "https://github.com/fimoklei/agent-harness/pull/45",
      },
    });
  });
});
