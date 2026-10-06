import { describe, expect, it } from "vitest";
import type {
  HarnessReviewRead,
  NewReviewRequest,
  ReviewRequest,
  ReviewWriteOutcome,
  ViewerRead,
} from "./harness-review-port";
import { ProposalActions } from "./proposal-actions";
import type { HarnessFacts } from "./read-harness-state";
import type { HarnessSkillTree } from "./skill-movements";

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
  headCommit: "3d0f1a9c5b7e2846f0a1c3d5e7b9081726354adf",
  baseBranch: "main",
  author: "fimoklei",
  title: "Promote skill: tdd",
  ...over,
});

// The pushed `maestro/tdd` still holds the skill: a change.
const PROMOTE_TREE: HarnessSkillTree[] = [{ name: "tdd", treeHash: "b2" }];

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
  refsRead: string[];
};

function build(overrides?: {
  root?: string | undefined;
  facts?: Partial<HarnessFacts>;
  review?: HarnessReviewRead;
  viewer?: ViewerRead;
  write?: ReviewWriteOutcome;
  promoteTree?: HarnessSkillTree[] | null;
  remoteTree?: HarnessSkillTree[] | null;
}) {
  const calls: Calls = { created: [], reopened: [], closed: [], refsRead: [] };
  const write = overrides?.write ?? ({ ok: true } as ReviewWriteOutcome);
  const actions = new ProposalActions({
    resolveRoot: async () =>
      overrides && "root" in overrides ? overrides.root : "/harness",
    git: {
      readFacts: async () => ({ ...FACTS, ...overrides?.facts }),
      readSkillTrees: async (_root, ref) => {
        calls.refsRead.push(ref);
        if (ref === FACTS.defaultBranchCommit) {
          return overrides && "remoteTree" in overrides
            ? (overrides.remoteTree ?? null)
            : PROMOTE_TREE;
        }
        return overrides && "promoteTree" in overrides
          ? (overrides.promoteTree ?? null)
          : PROMOTE_TREE;
      },
    },
    review: {
      readReviews: async () => overrides?.review ?? readOf([]),
      readViewer: async () =>
        overrides?.viewer ?? { outcome: "read", login: "fimoklei" },
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
      editRequest: async () => write,
    },
  });
  return { actions, calls };
}

describe("ProposalActions · create", () => {
  it.each<[string, HarnessSkillTree[], string]>([
    ["holds", PROMOTE_TREE, "Edit skill: tdd"],
    ["lacks", [], "Add skill: tdd"],
  ])(
    "opens a request over the prepared branch for a skill the default branch %s, without pushing anything",
    async (_, remoteTree, title) => {
      const { actions, calls } = build({ remoteTree });

      expect(await actions.create("tdd")).toEqual({ ok: true });
      expect(calls.created).toEqual([
        {
          head: "maestro/tdd",
          base: "main",
          title,
          body: "Proposed from the Maestro cockpit.",
        },
      ]);
    },
  );

  it("reads only the skill's pushed branch and the default branch, never the clone", async () => {
    const { actions, calls } = build();

    await actions.create("tdd");

    expect(calls.refsRead).toEqual(["refs/remotes/origin/maestro/tdd", "head"]);
  });

  it("titles the request Delete skill when the pushed branch deletes the skill", async () => {
    const { actions, calls } = build({
      promoteTree: [{ name: "other", treeHash: "d4" }],
    });

    expect(await actions.create("tdd")).toEqual({ ok: true });
    expect(calls.created).toEqual([
      {
        head: "maestro/tdd",
        base: "main",
        title: "Delete skill: tdd",
        body: "Deletes tdd from the Harness. Targets keep the skill until each one runs Update target after the next release.",
      },
    ]);
  });

  // An unfetched or unreadable branch names no kind; guessing one would mistitle it.
  it("opens nothing when the skill's pushed branch could not be read", async () => {
    const { actions, calls } = build({ promoteTree: null });

    expect(await actions.create("tdd")).toEqual({
      ok: false,
      error: "no-answer",
    });
    expect(calls.created).toEqual([]);
  });

  // Addition or edit is judged against the default branch; unread, it names neither.
  it.each([
    ["could not be read", { remoteTree: null }],
    ["has no known tip", { facts: { defaultBranchCommit: null } }],
  ])("opens nothing when the default branch %s", async (_, over) => {
    const { actions, calls } = build(over);

    expect(await actions.create("tdd")).toEqual({
      ok: false,
      error: "no-answer",
    });
    expect(calls.created).toEqual([]);
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

describe("ProposalActions · another contributor's proposal", () => {
  const theirs = request({ author: "teammate" });

  it("refuses to withdraw another contributor's open request", async () => {
    const { actions, calls } = build({ review: readOf([theirs]) });

    expect(await actions.withdraw("tdd", 45)).toEqual({
      ok: false,
      error: "proposed-by-other",
    });
    expect(calls.closed).toEqual([]);
  });

  it("refuses to create a request while another contributor's is open", async () => {
    const { actions, calls } = build({ review: readOf([theirs]) });

    expect(await actions.create("tdd")).toEqual({
      ok: false,
      error: "proposed-by-other",
    });
    expect(calls.created).toEqual([]);
  });

  it("refuses to reopen another contributor's closed request", async () => {
    const closed = request({ state: "closed", author: "teammate" });
    const { actions, calls } = build({ review: readOf([closed]) });

    expect(await actions.reopen("tdd", 45)).toEqual({
      ok: false,
      error: "proposed-by-other",
    });
    expect(calls.reopened).toEqual([]);
  });

  it("refuses to reopen the author's own request over another's open one", async () => {
    const { actions, calls } = build({
      review: readOf([theirs, request({ number: 40, state: "closed" })]),
    });

    expect(await actions.reopen("tdd", 40)).toEqual({
      ok: false,
      error: "proposed-by-other",
    });
    expect(calls.reopened).toEqual([]);
  });

  it("withdraws the author's own request as before", async () => {
    const { actions, calls } = build({
      review: readOf([request({ author: "FimoKlei" })]),
    });

    expect(await actions.withdraw("tdd", 45)).toEqual({ ok: true });
    expect(calls.closed).toEqual([45]);
  });

  it("refuses nothing when the sign-in cannot be read", async () => {
    const { actions, calls } = build({
      review: readOf([theirs]),
      viewer: { outcome: "unavailable" },
    });

    expect(await actions.withdraw("tdd", 45)).toEqual({ ok: true });
    expect(calls.closed).toEqual([45]);
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
