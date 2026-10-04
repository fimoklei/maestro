import { describe, expect, it } from "vitest";
import type {
  HarnessReviewPort,
  HarnessReviewRead,
  NewReviewRequest,
  ReviewRequest,
} from "./harness-review-port";
import { beforeProposalPush } from "./proposal-request";

const TARGET = {
  origin: { host: "github.com", ownerRepo: "fimoklei/agent-harness" },
  base: "main",
  name: "tdd",
};

const request = (number: number): ReviewRequest => ({
  number,
  url: `https://github.com/fimoklei/agent-harness/pull/${number}`,
  state: "open",
  draft: false,
  decision: null,
  reviewers: [],
  headOwner: "fimoklei",
  headRepo: "agent-harness",
  headBranch: "maestro/tdd",
  headCommit: "3d0f1a9c5b7e2846f0a1c3d5e7b9081726354adf",
  baseBranch: "main",
});

const readOf = (requests: ReviewRequest[]): HarnessReviewRead => ({
  outcome: "read",
  requests,
  complete: true,
  limit: 100,
});

function reviewWith(read: HarnessReviewRead) {
  const created: NewReviewRequest[] = [];
  const review: HarnessReviewPort = {
    readReviews: async () => read,
    createRequest: async (_origin, made) => {
      created.push(made);
      return { ok: true };
    },
    reopenRequest: async () => ({ ok: true }),
    closeRequest: async () => ({ ok: true }),
  };
  return { review, created };
}

describe("beforeProposalPush", () => {
  it("opens a request after the push when GitHub said there is none", async () => {
    const { review, created } = reviewWith(readOf([]));

    const step = await beforeProposalPush(review, TARGET);
    if (!step.ok) throw new Error("refused");
    await step.afterPush();

    expect(created).toEqual([
      {
        head: "maestro/tdd",
        base: "main",
        title: "Promote skill: tdd",
        body: "Proposed from the Maestro cockpit.",
      },
    ]);
  });

  it("opens none when one request is already open", async () => {
    const { review, created } = reviewWith(readOf([request(45)]));

    const step = await beforeProposalPush(review, TARGET);
    if (!step.ok) throw new Error("refused");
    await step.afterPush();

    expect(created).toEqual([]);
  });

  it("refuses before the push when more than one request is open", async () => {
    const { review } = reviewWith(readOf([request(45), request(46)]));

    expect(await beforeProposalPush(review, TARGET)).toEqual({
      ok: false,
      error: "extra-requests",
    });
  });

  it.each<[string, HarnessReviewRead]>([
    ["failed", { outcome: "failed" }],
    ["unavailable", { outcome: "unavailable" }],
    ["bounded", { outcome: "read", requests: [], complete: false, limit: 100 }],
  ])("opens none after a %s read: unknown is never none", async (_, read) => {
    const { review, created } = reviewWith(read);

    const step = await beforeProposalPush(review, TARGET);
    if (!step.ok) throw new Error("refused");
    await step.afterPush();

    expect(created).toEqual([]);
  });
});
