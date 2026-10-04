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

const request = (
  number: number,
  title = "Promote skill: tdd",
): ReviewRequest => ({
  number,
  title,
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
  author: "fimoklei",
});

const readOf = (requests: ReviewRequest[]): HarnessReviewRead => ({
  outcome: "read",
  requests,
  complete: true,
  limit: 100,
});

function reviewWith(read: HarnessReviewRead) {
  const created: NewReviewRequest[] = [];
  const edited: { number: number; title: string }[] = [];
  const review: HarnessReviewPort = {
    readReviews: async () => read,
    createRequest: async (_origin, made) => {
      created.push(made);
      return { ok: true };
    },
    reopenRequest: async () => ({ ok: true }),
    closeRequest: async () => ({ ok: true }),
    editRequest: async (_origin, number, { title }) => {
      edited.push({ number, title });
      return { ok: true };
    },
  };
  return { review, created, edited };
}

describe("beforeProposalPush", () => {
  it("opens a request after the push when GitHub said there is none", async () => {
    const { review, created } = reviewWith(readOf([]));

    const step = await beforeProposalPush(review, TARGET, "change");
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

    const step = await beforeProposalPush(review, TARGET, "change");
    if (!step.ok) throw new Error("refused");
    await step.afterPush();

    expect(created).toEqual([]);
  });

  it("refuses before the push when more than one request is open", async () => {
    const { review } = reviewWith(readOf([request(45), request(46)]));

    expect(await beforeProposalPush(review, TARGET, "change")).toEqual({
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

    const step = await beforeProposalPush(review, TARGET, "change");
    if (!step.ok) throw new Error("refused");
    await step.afterPush();

    expect(created).toEqual([]);
  });

  it("titles a new deletion request Delete skill, with the deletion body", async () => {
    const { review, created } = reviewWith(readOf([]));

    const step = await beforeProposalPush(review, TARGET, "deletion");
    if (!step.ok) throw new Error("refused");
    await step.afterPush();

    expect(created).toEqual([
      {
        head: "maestro/tdd",
        base: "main",
        title: "Delete skill: tdd",
        body: "Deletes tdd from the Harness. Targets keep the skill until each one runs Update target after the next release.",
      },
    ]);
  });

  it("retitles an open change request after a deletion push", async () => {
    const { review, edited } = reviewWith(
      readOf([request(45, "Promote skill: tdd (v2)")]),
    );

    const step = await beforeProposalPush(review, TARGET, "deletion");
    if (!step.ok) throw new Error("refused");
    await step.afterPush();

    expect(edited).toEqual([{ number: 45, title: "Delete skill: tdd" }]);
  });

  it("retitles an open deletion request after a change push", async () => {
    const { review, edited } = reviewWith(
      readOf([request(45, "Delete skill: tdd")]),
    );

    const step = await beforeProposalPush(review, TARGET, "change");
    if (!step.ok) throw new Error("refused");
    await step.afterPush();

    expect(edited).toEqual([{ number: 45, title: "Promote skill: tdd" }]);
  });

  it.each<[string, string, "change" | "deletion"]>([
    ["a custom title", "Rework tdd for the new runner", "deletion"],
    ["a push that keeps the kind", "Delete skill: tdd", "deletion"],
    ["a change push over a change title", "Promote skill: tdd (v2)", "change"],
  ])("edits nothing for %s", async (_, title, kind) => {
    const { review, edited } = reviewWith(readOf([request(45, title)]));

    const step = await beforeProposalPush(review, TARGET, kind);
    if (!step.ok) throw new Error("refused");
    await step.afterPush();

    expect(edited).toEqual([]);
  });

  it("settles after a failed retitle: the pushed branch is the truth", async () => {
    const { review } = reviewWith(
      readOf([request(45, "Promote skill: tdd (v2)")]),
    );
    review.editRequest = async () => ({ ok: false, error: "failed" });

    const step = await beforeProposalPush(review, TARGET, "deletion");
    if (!step.ok) throw new Error("refused");

    await expect(step.afterPush()).resolves.toBeUndefined();
  });
});
