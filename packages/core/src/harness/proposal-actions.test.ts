import { describe, expect, it } from "vitest";
import type {
  HarnessReviewRead,
  NewReviewRequest,
  ReviewRequest,
  ReviewWriteOutcome,
} from "./harness-review-port";
import { ProposalActions } from "./proposal-actions";
import type { HarnessFacts } from "./read-harness-state";

const FACTS: HarnessFacts = {
  originUrl: "git@github.com:fimoklei/agent-harness.git",
  defaultBranch: "main",
  defaultBranchCommit: "head",
  tags: [],
};

const request = (over: Partial<ReviewRequest> = {}): ReviewRequest => ({
  number: 45,
  url: "https://github.com/fimoklei/agent-harness/pull/45",
  state: "open",
  draft: false,
  decision: null,
  reviewers: [],
  headOwner: "fimoklei",
  headRepo: "agent-harness",
  headBranch: "maestro/tdd",
  baseBranch: "main",
  ...over,
});

const readOf = (requests: ReviewRequest[]): HarnessReviewRead => ({
  outcome: "read",
  requests,
  complete: true,
  limit: 100,
});

type Calls = {
  created: NewReviewRequest[];
  reopened: number[];
  closed: number[];
};

function build(overrides?: {
  root?: string | undefined;
  facts?: Partial<HarnessFacts>;
  review?: HarnessReviewRead;
  write?: ReviewWriteOutcome;
}) {
  const calls: Calls = { created: [], reopened: [], closed: [] };
  const write = overrides?.write ?? ({ ok: true } as ReviewWriteOutcome);
  const actions = new ProposalActions({
    resolveRoot: async () =>
      overrides && "root" in overrides ? overrides.root : "/harness",
    git: {
      readFacts: async () => ({ ...FACTS, ...overrides?.facts }),
    },
    review: {
      readReviews: async () => overrides?.review ?? readOf([]),
      createRequest: async (_origin, made) => {
        calls.created.push(made);
        return write;
      },
      reopenRequest: async (_origin, number) => {
        calls.reopened.push(number);
        return write;
      },
      closeRequest: async (_origin, number) => {
        calls.closed.push(number);
        return write;
      },
    },
  });
  return { actions, calls };
}

describe("ProposalActions · create", () => {
  it("opens a request over the prepared branch, without pushing anything", async () => {
    const { actions, calls } = build();

    expect(await actions.create("tdd")).toEqual({ ok: true });
    expect(calls.created).toEqual([
      {
        head: "maestro/tdd",
        base: "main",
        title: "Promote skill: tdd",
        body: "Proposed from the Maestro cockpit.",
      },
    ]);
  });

  it("refuses when a matching request is already open", async () => {
    const { actions, calls } = build({ review: readOf([request()]) });

    expect(await actions.create("tdd")).toEqual({
      ok: false,
      error: "request-exists",
    });
    expect(calls.created).toEqual([]);
  });

  it("opens one anyway when only a closed request matches", async () => {
    const { actions, calls } = build({
      review: readOf([request({ state: "closed" })]),
    });

    expect(await actions.create("tdd")).toEqual({ ok: true });
    expect(calls.created).toHaveLength(1);
  });

  it("ignores a request opened from another head or into another base", async () => {
    const { actions, calls } = build({
      review: readOf([
        request({ headOwner: "someone-else" }),
        request({ number: 46, baseBranch: "release" }),
        request({ number: 47, headBranch: "maestro/other" }),
      ]),
    });

    expect(await actions.create("tdd")).toEqual({ ok: true });
    expect(calls.created).toHaveLength(1);
  });
});

describe("ProposalActions · reopen", () => {
  it("reopens the named closed request", async () => {
    const { actions, calls } = build({
      review: readOf([request({ state: "closed" })]),
    });

    expect(await actions.reopen("tdd", 45)).toEqual({ ok: true });
    expect(calls.reopened).toEqual([45]);
  });

  it("refuses a number the fresh read no longer matches to this skill", async () => {
    const { actions, calls } = build({
      review: readOf([request({ number: 44, state: "closed" })]),
    });

    expect(await actions.reopen("tdd", 45)).toEqual({
      ok: false,
      error: "request-gone",
    });
    expect(calls.reopened).toEqual([]);
  });

  it("refuses a merged request, which reopening cannot resume", async () => {
    const { actions, calls } = build({
      review: readOf([request({ state: "merged" })]),
    });

    expect(await actions.reopen("tdd", 45)).toEqual({
      ok: false,
      error: "request-gone",
    });
    expect(calls.reopened).toEqual([]);
  });

  it("refuses while more than one open request matches the branch", async () => {
    const { actions, calls } = build({
      review: readOf([
        request({ number: 41 }),
        request({ number: 44 }),
        request({ number: 45, state: "closed" }),
      ]),
    });

    expect(await actions.reopen("tdd", 45)).toEqual({
      ok: false,
      error: "extra-requests",
    });
    expect(calls.reopened).toEqual([]);
  });

  it("reports GitHub's refusal as a failed action", async () => {
    const { actions } = build({
      review: readOf([request({ state: "closed" })]),
      write: { ok: false, error: "failed" },
    });

    expect(await actions.reopen("tdd", 45)).toEqual({
      ok: false,
      error: "action-failed",
    });
  });
});

describe("ProposalActions · withdraw", () => {
  it("closes the sole open request and nothing else", async () => {
    const { actions, calls } = build({ review: readOf([request()]) });

    expect(await actions.withdraw("tdd", 45)).toEqual({ ok: true });
    expect(calls.closed).toEqual([45]);
  });

  it("refuses while more than one open request matches the branch", async () => {
    const { actions, calls } = build({
      review: readOf([request({ number: 41 }), request({ number: 44 })]),
    });

    expect(await actions.withdraw("tdd", 41)).toEqual({
      ok: false,
      error: "extra-requests",
    });
    expect(calls.closed).toEqual([]);
  });

  it("refuses a number that is no longer the open request", async () => {
    const { actions, calls } = build({
      review: readOf([request({ number: 44 })]),
    });

    expect(await actions.withdraw("tdd", 45)).toEqual({
      ok: false,
      error: "request-gone",
    });
    expect(calls.closed).toEqual([]);
  });
});

describe("ProposalActions · what authorizes an action", () => {
  it("refuses every action with no harness connected", async () => {
    const { actions, calls } = build({ root: undefined });

    expect(await actions.create("tdd")).toEqual({
      ok: false,
      error: "not-configured",
    });
    expect(await actions.withdraw("tdd", 45)).toEqual({
      ok: false,
      error: "not-configured",
    });
    expect(calls.created).toEqual([]);
  });

  it("refuses a name that is not a skill", async () => {
    const { actions, calls } = build();

    expect(await actions.create("../etc")).toEqual({
      ok: false,
      error: "invalid-skill",
    });
    expect(calls.created).toEqual([]);
  });

  it("refuses when the origin is not one apm could resolve", async () => {
    const { actions } = build({ facts: { originUrl: null } });

    expect(await actions.create("tdd")).toEqual({
      ok: false,
      error: "no-usable-origin",
    });
  });

  it("refuses when the default branch could not be read", async () => {
    const { actions } = build({ facts: { defaultBranch: null } });

    expect(await actions.create("tdd")).toEqual({
      ok: false,
      error: "no-answer",
    });
  });

  it("refuses when GitHub cannot be asked at all", async () => {
    const { actions, calls } = build({ review: { outcome: "unavailable" } });

    expect(await actions.create("tdd")).toEqual({
      ok: false,
      error: "review-unavailable",
    });
    expect(calls.created).toEqual([]);
  });

  it("refuses when the review read did not answer", async () => {
    const { actions, calls } = build({ review: { outcome: "failed" } });

    expect(await actions.withdraw("tdd", 45)).toEqual({
      ok: false,
      error: "review-unknown",
    });
    expect(calls.closed).toEqual([]);
  });

  it("refuses on a bounded read, which cannot prove which requests match", async () => {
    const { actions, calls } = build({
      review: { outcome: "read", requests: [], complete: false, limit: 100 },
    });

    expect(await actions.create("tdd")).toEqual({
      ok: false,
      error: "review-unknown",
    });
    expect(calls.created).toEqual([]);
  });
});
