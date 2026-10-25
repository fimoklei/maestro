import { describe, expect, it } from "vitest";
import { InFlightLocks } from "../deploy/in-flight-locks";
import { harnessDisk } from "./harness-disk.fake";
import { InMemoryHarnessGit, type Skills, skillRef } from "./harness-git.fake";
import type {
  HarnessReviewRead,
  NewReviewRequest,
  ReviewRequest,
  ReviewWriteOutcome,
  ViewerRead,
} from "./harness-review-port";
import { ProposalActions } from "./proposal-actions";

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

const SKILLS = "/harness/.apm/skills";
const STAGING = `${SKILLS}/.maestro-copy-1`;

// The pushed `maestro/tdd` still holds the skill: a change.
const PROMOTE_TREE: Skills = { tdd: "proposed tdd" };

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
  // Mutates the clone; the default is a fetched `maestro/tdd` over a default
  // branch that holds the same `tdd`.
  world?: (git: InMemoryHarnessGit) => void;
  review?: HarnessReviewRead;
  viewer?: ViewerRead;
  write?: ReviewWriteOutcome;
  // null: a ref nobody could read.
  promoteTree?: Skills | null;
  remoteTree?: Skills | null;
  disk?: Parameters<typeof harnessDisk>[0];
  // A move into this path fails once.
  failMoveInto?: string;
  locks?: InFlightLocks;
}) {
  const calls: Calls = { created: [], reopened: [], closed: [] };
  const moved: [string, string][] = [];
  const removed: string[] = [];
  let failsLeft = overrides?.failMoveInto === undefined ? 0 : 1;
  const write = overrides?.write ?? ({ ok: true } as ReviewWriteOutcome);
  const git = new InMemoryHarnessGit();
  git.commit("head", overrides?.remoteTree ?? PROMOTE_TREE);
  git.commit("tdd-tip", overrides?.promoteTree ?? PROMOTE_TREE, {
    parent: "head",
  });
  git.tip = "head";
  git.head = "head";
  git.promote = { tdd: "tdd-tip" };
  if (overrides?.remoteTree === null) {
    git.unreadable.add("head");
  }
  if (overrides?.promoteTree === null) {
    git.unreadable.add("tdd-tip");
  }
  overrides?.world?.(git);
  const actions = new ProposalActions({
    resolveRoot: async () =>
      overrides && "root" in overrides ? overrides.root : "/harness",
    git,
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
    fs: harnessDisk(overrides?.disk ?? { entries: [`${SKILLS}/tdd`] }),
    copyFs: {
      createStagingDir: async () => STAGING,
      movePath: async (from, to) => {
        if (to === overrides?.failMoveInto && failsLeft-- > 0) {
          throw new Error("EACCES");
        }
        moved.push([from, to]);
      },
      removePath: async (path) => {
        removed.push(path);
      },
    },
    locks: overrides?.locks ?? new InFlightLocks(),
  });
  return { actions, calls, git, moved, removed };
}

describe("ProposalActions · create", () => {
  it.each<[string, Skills, string]>([
    ["holds", PROMOTE_TREE, "Edit skill: tdd"],
    ["lacks", {}, "Add skill: tdd"],
  ])(
    "opens a request over the prepared branch for a skill the default branch %s, without pushing anything",
    async (_, remoteTree, title) => {
      const { actions, calls } = build({ remoteTree });

      expect(await actions.create(skillRef("tdd"))).toEqual({ ok: true });
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
    const { actions, git } = build();

    await actions.create(skillRef("tdd"));

    expect(git.treeReads).toEqual(["refs/remotes/origin/maestro/tdd", "head"]);
  });

  it("titles the request Delete skill when the pushed branch deletes the skill", async () => {
    const { actions, calls } = build({
      promoteTree: { other: "other" },
    });

    expect(await actions.create(skillRef("tdd"))).toEqual({ ok: true });
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

    expect(await actions.create(skillRef("tdd"))).toEqual({
      ok: false,
      error: "no-answer",
    });
    expect(calls.created).toEqual([]);
  });

  // Addition or edit is judged against the default branch; unread, it names neither.
  it.each([
    ["could not be read", { remoteTree: null }],
    [
      "has no known tip",
      {
        world: (git: InMemoryHarnessGit) => {
          git.tip = null;
        },
      },
    ],
  ])("opens nothing when the default branch %s", async (_, over) => {
    const { actions, calls } = build(over);

    expect(await actions.create(skillRef("tdd"))).toEqual({
      ok: false,
      error: "no-answer",
    });
    expect(calls.created).toEqual([]);
  });

  it("refuses when a matching request is already open", async () => {
    const { actions, calls } = build({ review: readOf([request()]) });

    expect(await actions.create(skillRef("tdd"))).toEqual({
      ok: false,
      error: "request-exists",
    });
    expect(calls.created).toEqual([]);
  });

  it("opens one anyway when only a closed request matches", async () => {
    const { actions, calls } = build({
      review: readOf([request({ state: "closed" })]),
    });

    expect(await actions.create(skillRef("tdd"))).toEqual({ ok: true });
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

    expect(await actions.create(skillRef("tdd"))).toEqual({ ok: true });
    expect(calls.created).toHaveLength(1);
  });
});

describe("ProposalActions · reopen", () => {
  it("reopens the named closed request", async () => {
    const { actions, calls } = build({
      review: readOf([request({ state: "closed" })]),
    });

    expect(await actions.reopen(skillRef("tdd"), 45)).toEqual({ ok: true });
    expect(calls.reopened).toEqual([45]);
  });

  it("refuses a number the fresh read no longer matches to this skill", async () => {
    const { actions, calls } = build({
      review: readOf([request({ number: 44, state: "closed" })]),
    });

    expect(await actions.reopen(skillRef("tdd"), 45)).toEqual({
      ok: false,
      error: "request-gone",
    });
    expect(calls.reopened).toEqual([]);
  });

  it("refuses a merged request, which reopening cannot resume", async () => {
    const { actions, calls } = build({
      review: readOf([request({ state: "merged" })]),
    });

    expect(await actions.reopen(skillRef("tdd"), 45)).toEqual({
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

    expect(await actions.reopen(skillRef("tdd"), 45)).toEqual({
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

    expect(await actions.reopen(skillRef("tdd"), 45)).toEqual({
      ok: false,
      error: "action-failed",
    });
  });
});

describe("ProposalActions · withdraw", () => {
  it("replaces the folder with its default-branch copy, closes the request and deletes the branch", async () => {
    const { actions, calls, git, moved, removed } = build({
      review: readOf([request()]),
    });

    expect(await actions.withdraw(skillRef("tdd"), 45)).toEqual({ ok: true });
    expect(git.written).toEqual([
      { type: "skill", name: "tdd", commit: "head", into: STAGING },
    ]);
    expect(moved).toEqual([
      [`${SKILLS}/tdd`, `${STAGING}/discarded`],
      [`${STAGING}/tdd`, `${SKILLS}/tdd`],
    ]);
    expect(removed).toEqual([STAGING]);
    expect(calls.closed).toEqual([45]);
    expect(git.deletedBranches).toEqual(["maestro/tdd"]);
  });

  it("takes an added skill out of the Working Harness, writing nothing", async () => {
    const { actions, git, moved, removed } = build({
      review: readOf([request()]),
      remoteTree: {},
    });

    expect(await actions.withdraw(skillRef("tdd"), 45)).toEqual({ ok: true });
    expect(git.written).toEqual([]);
    expect(moved).toEqual([[`${SKILLS}/tdd`, `${STAGING}/discarded`]]);
    expect(removed).toEqual([STAGING]);
  });

  it("leaves the disk alone for an added skill already gone from it", async () => {
    const { actions, calls, moved, removed } = build({
      review: readOf([request()]),
      remoteTree: {},
      disk: { entries: [] },
    });

    expect(await actions.withdraw(skillRef("tdd"), 45)).toEqual({ ok: true });
    expect(moved).toEqual([]);
    expect(removed).toEqual([]);
    expect(calls.closed).toEqual([45]);
  });

  it("brings a deleted skill back from the default branch", async () => {
    const { actions, git, moved } = build({
      review: readOf([request()]),
      promoteTree: {},
      disk: { entries: [] },
    });

    expect(await actions.withdraw(skillRef("tdd"), 45)).toEqual({ ok: true });
    expect(git.written).toEqual([
      { type: "skill", name: "tdd", commit: "head", into: STAGING },
    ]);
    expect(moved).toEqual([[`${STAGING}/tdd`, `${SKILLS}/tdd`]]);
  });

  it("brings a deleted prompt back when its type folder went with it", async () => {
    const PROMPTS = "/harness/.maestro/prompts";
    const { actions, git, moved } = build({
      review: readOf([request({ headBranch: "maestro/prompt.review" })]),
      world: (git) => {
        git.commit("prompt-head", {}, { prompts: { review: "on main" } });
        git.commit("prompt-tip", {}, { parent: "prompt-head" });
        git.tip = "prompt-head";
        git.promote = { "prompt.review": "prompt-tip" };
      },
      disk: { missing: [PROMPTS] },
    });

    expect(
      await actions.withdraw({ type: "prompt", name: "review" }, 45),
    ).toEqual({ ok: true });
    expect(git.written).toEqual([
      { type: "prompt", name: "review", commit: "prompt-head", into: STAGING },
    ]);
    expect(moved).toEqual([[`${STAGING}/review.md`, `${PROMPTS}/review.md`]]);
  });

  it("closes nothing and keeps the branch when the folder cannot be replaced", async () => {
    const { actions, calls, git } = build({
      review: readOf([request()]),
      failMoveInto: `${STAGING}/discarded`,
    });

    expect(await actions.withdraw(skillRef("tdd"), 45)).toEqual({
      ok: false,
      error: "replace-failed",
    });
    expect(calls.closed).toEqual([]);
    expect(git.deletedBranches).toEqual([]);
  });

  it("puts the edited folder back when the default-branch copy cannot move in", async () => {
    const { actions, moved } = build({
      review: readOf([request()]),
      failMoveInto: `${SKILLS}/tdd`,
    });

    expect(await actions.withdraw(skillRef("tdd"), 45)).toEqual({
      ok: false,
      error: "replace-failed",
    });
    expect(moved).toEqual([
      [`${SKILLS}/tdd`, `${STAGING}/discarded`],
      [`${STAGING}/discarded`, `${SKILLS}/tdd`],
    ]);
  });

  it("keeps the branch when GitHub refuses to close the request, the folder already replaced", async () => {
    const { actions, git } = build({
      review: readOf([request()]),
      write: { ok: false, error: "failed" },
    });

    expect(await actions.withdraw(skillRef("tdd"), 45)).toEqual({
      ok: false,
      error: "close-failed",
    });
    expect(git.written).toHaveLength(1);
    expect(git.deletedBranches).toEqual([]);
  });

  it("reports the branch left behind when its deletion fails, the request already closed", async () => {
    const { actions, calls } = build({
      review: readOf([request()]),
      world: (git) => {
        git.deleteOutcome = "failed";
      },
    });

    expect(await actions.withdraw(skillRef("tdd"), 45)).toEqual({
      ok: false,
      error: "branch-delete-failed",
    });
    expect(calls.closed).toEqual([45]);
  });

  it("touches nothing while a merge is in progress in the clone", async () => {
    const { actions, calls, git, moved } = build({
      review: readOf([request()]),
      world: (git) => {
        git.ambiguity = "merge-in-progress";
      },
    });

    expect(await actions.withdraw(skillRef("tdd"), 45)).toEqual({
      ok: false,
      error: "merge-in-progress",
    });
    expect(moved).toEqual([]);
    expect(calls.closed).toEqual([]);
    expect(git.deletedBranches).toEqual([]);
  });

  it("touches nothing when a push would land somewhere else than the fetch", async () => {
    const { actions, calls, git, moved } = build({
      review: readOf([request()]),
      world: (git) => {
        git.pushesWhereItFetched = false;
      },
    });

    expect(await actions.withdraw(skillRef("tdd"), 45)).toEqual({
      ok: false,
      error: "push-elsewhere",
    });
    expect(moved).toEqual([]);
    expect(calls.closed).toEqual([]);
    expect(git.deletedBranches).toEqual([]);
  });

  it("touches nothing when the skill folder is a link", async () => {
    const { actions, calls, moved } = build({
      review: readOf([request()]),
      disk: { links: { [`${SKILLS}/tdd`]: "/elsewhere" } },
    });

    expect(await actions.withdraw(skillRef("tdd"), 45)).toEqual({
      ok: false,
      error: "destination-unsafe",
    });
    expect(moved).toEqual([]);
    expect(calls.closed).toEqual([]);
  });

  it("refuses while another write holds the Working Harness", async () => {
    const locks = new InFlightLocks();
    const { actions, calls } = build({ review: readOf([request()]), locks });
    let release = () => {};
    const held = locks.run(
      "/harness",
      () => new Promise<void>((resolve) => (release = resolve)),
    );

    expect(await actions.withdraw(skillRef("tdd"), 45)).toEqual({
      ok: false,
      error: "withdraw-in-progress",
    });
    release();
    await held;
    expect(calls.closed).toEqual([]);
  });

  it("refuses while more than one open request matches the branch", async () => {
    const { actions, calls } = build({
      review: readOf([request({ number: 41 }), request({ number: 44 })]),
    });

    expect(await actions.withdraw(skillRef("tdd"), 41)).toEqual({
      ok: false,
      error: "extra-requests",
    });
    expect(calls.closed).toEqual([]);
  });

  it("refuses a number that is no longer the open request", async () => {
    const { actions, calls } = build({
      review: readOf([request({ number: 44 })]),
    });

    expect(await actions.withdraw(skillRef("tdd"), 45)).toEqual({
      ok: false,
      error: "request-gone",
    });
    expect(calls.closed).toEqual([]);
  });
});

describe("ProposalActions · withdraw without an open request", () => {
  it("replaces the folder and deletes the branch of a closed proposal, closing nothing", async () => {
    const { actions, calls, git, moved } = build({
      review: readOf([request({ state: "closed" })]),
    });

    expect(await actions.withdraw(skillRef("tdd"), null)).toEqual({
      ok: true,
    });
    expect(moved).toEqual([
      [`${SKILLS}/tdd`, `${STAGING}/discarded`],
      [`${STAGING}/tdd`, `${SKILLS}/tdd`],
    ]);
    expect(calls.closed).toEqual([]);
    expect(git.deletedBranches).toEqual(["maestro/tdd"]);
  });

  it("withdraws a branch no pull request was ever opened over", async () => {
    const { actions, calls, git } = build({ review: readOf([]) });

    expect(await actions.withdraw(skillRef("tdd"), null)).toEqual({
      ok: true,
    });
    expect(calls.closed).toEqual([]);
    expect(git.deletedBranches).toEqual(["maestro/tdd"]);
  });

  it("touches nothing when a request was opened since the read", async () => {
    const { actions, calls, git, moved } = build({
      review: readOf([request()]),
    });

    expect(await actions.withdraw(skillRef("tdd"), null)).toEqual({
      ok: false,
      error: "request-exists",
    });
    expect(moved).toEqual([]);
    expect(calls.closed).toEqual([]);
    expect(git.deletedBranches).toEqual([]);
  });

  it("refuses when the newest closed request is another contributor's", async () => {
    const { actions, git, moved } = build({
      review: readOf([
        request({ number: 40, state: "closed" }),
        request({ number: 45, state: "closed", author: "teammate" }),
      ]),
    });

    expect(await actions.withdraw(skillRef("tdd"), null)).toEqual({
      ok: false,
      error: "proposed-by-other",
    });
    expect(moved).toEqual([]);
    expect(git.deletedBranches).toEqual([]);
  });

  it("refuses a branch that holds another contributor's commit", async () => {
    const { actions, git, moved } = build({
      review: readOf([]),
      world: (git) => {
        git.authorship = { tdd: "others" };
      },
    });

    expect(await actions.withdraw(skillRef("tdd"), null)).toEqual({
      ok: false,
      error: "branch-by-other",
    });
    expect(moved).toEqual([]);
    expect(git.deletedBranches).toEqual([]);
  });

  it("refuses a closed proposal whose branch moved on under another author", async () => {
    const { actions, git } = build({
      review: readOf([request({ state: "closed" })]),
      world: (git) => {
        git.authorship = { tdd: "others" };
      },
    });

    expect(await actions.withdraw(skillRef("tdd"), null)).toEqual({
      ok: false,
      error: "branch-by-other",
    });
    expect(git.deletedBranches).toEqual([]);
  });

  it.each([
    ["no-email", "commit-email-missing"],
    ["unknown", "branch-authors-unknown"],
  ] as const)(
    "touches nothing when the branch's authors read %s",
    async (authorship, error) => {
      const { actions, git, moved } = build({
        review: readOf([]),
        world: (git) => {
          git.authorship = { tdd: authorship };
        },
      });

      expect(await actions.withdraw(skillRef("tdd"), null)).toEqual({
        ok: false,
        error,
      });
      expect(moved).toEqual([]);
      expect(git.deletedBranches).toEqual([]);
    },
  );

  it("withdraws when the newest closed request is the author's own", async () => {
    const { actions, git } = build({
      review: readOf([
        request({ number: 45, state: "closed" }),
        request({ number: 40, state: "closed", author: "teammate" }),
      ]),
    });

    expect(await actions.withdraw(skillRef("tdd"), null)).toEqual({
      ok: true,
    });
    expect(git.deletedBranches).toEqual(["maestro/tdd"]);
  });
});

describe("ProposalActions · another contributor's proposal", () => {
  const theirs = request({ author: "teammate" });

  it("refuses to withdraw another contributor's open request", async () => {
    const { actions, calls, git, moved } = build({ review: readOf([theirs]) });

    expect(await actions.withdraw(skillRef("tdd"), 45)).toEqual({
      ok: false,
      error: "proposed-by-other",
    });
    expect(calls.closed).toEqual([]);
    expect(moved).toEqual([]);
    expect(git.deletedBranches).toEqual([]);
  });

  it("refuses to create a request while another contributor's is open", async () => {
    const { actions, calls } = build({ review: readOf([theirs]) });

    expect(await actions.create(skillRef("tdd"))).toEqual({
      ok: false,
      error: "proposed-by-other",
    });
    expect(calls.created).toEqual([]);
  });

  it("refuses to reopen another contributor's closed request", async () => {
    const closed = request({ state: "closed", author: "teammate" });
    const { actions, calls } = build({ review: readOf([closed]) });

    expect(await actions.reopen(skillRef("tdd"), 45)).toEqual({
      ok: false,
      error: "proposed-by-other",
    });
    expect(calls.reopened).toEqual([]);
  });

  it("refuses to reopen the author's own request over another's open one", async () => {
    const { actions, calls } = build({
      review: readOf([theirs, request({ number: 40, state: "closed" })]),
    });

    expect(await actions.reopen(skillRef("tdd"), 40)).toEqual({
      ok: false,
      error: "proposed-by-other",
    });
    expect(calls.reopened).toEqual([]);
  });

  it("withdraws the author's own request as before", async () => {
    const { actions, calls } = build({
      review: readOf([request({ author: "FimoKlei" })]),
    });

    expect(await actions.withdraw(skillRef("tdd"), 45)).toEqual({ ok: true });
    expect(calls.closed).toEqual([45]);
  });

  it("refuses nothing when the sign-in cannot be read", async () => {
    const { actions, calls } = build({
      review: readOf([theirs]),
      viewer: { outcome: "unavailable" },
    });

    expect(await actions.withdraw(skillRef("tdd"), 45)).toEqual({ ok: true });
    expect(calls.closed).toEqual([45]);
  });
});

describe("ProposalActions · what authorizes an action", () => {
  it("refuses every action with no harness connected", async () => {
    const { actions, calls } = build({ root: undefined });

    expect(await actions.create(skillRef("tdd"))).toEqual({
      ok: false,
      error: "not-configured",
    });
    expect(await actions.withdraw(skillRef("tdd"), 45)).toEqual({
      ok: false,
      error: "not-configured",
    });
    expect(calls.created).toEqual([]);
  });

  it("refuses a name that is not a skill", async () => {
    const { actions, calls } = build();

    expect(await actions.create(skillRef("../etc"))).toEqual({
      ok: false,
      error: "invalid-skill",
    });
    expect(calls.created).toEqual([]);
  });

  it("refuses when the origin is not one apm could resolve", async () => {
    const { actions } = build({
      world: (git) => {
        git.originUrl = null;
      },
    });

    expect(await actions.create(skillRef("tdd"))).toEqual({
      ok: false,
      error: "no-usable-origin",
    });
  });

  it("refuses when the default branch could not be read", async () => {
    const { actions } = build({
      world: (git) => {
        git.defaultBranch = null;
      },
    });

    expect(await actions.create(skillRef("tdd"))).toEqual({
      ok: false,
      error: "no-answer",
    });
  });

  it("refuses when GitHub cannot be asked at all", async () => {
    const { actions, calls } = build({ review: { outcome: "unavailable" } });

    expect(await actions.create(skillRef("tdd"))).toEqual({
      ok: false,
      error: "review-unavailable",
    });
    expect(calls.created).toEqual([]);
  });

  it("refuses when the review read did not answer", async () => {
    const { actions, calls } = build({ review: { outcome: "failed" } });

    expect(await actions.withdraw(skillRef("tdd"), 45)).toEqual({
      ok: false,
      error: "review-unknown",
    });
    expect(calls.closed).toEqual([]);
  });

  it("refuses on a bounded read, which cannot prove which requests match", async () => {
    const { actions, calls } = build({
      review: { outcome: "read", requests: [], complete: false, limit: 100 },
    });

    expect(await actions.create(skillRef("tdd"))).toEqual({
      ok: false,
      error: "review-unknown",
    });
    expect(calls.created).toEqual([]);
  });
});

describe("ProposalActions · unproposed files", () => {
  it("names the files a withdrawal would lose", async () => {
    const { actions } = build({
      world: (git) => {
        git.unproposed = { tdd: ["SKILL.md", "references/notes.md"] };
      },
    });

    expect(await actions.unproposedFiles(skillRef("tdd"))).toEqual({
      ok: true,
      files: ["SKILL.md", "references/notes.md"],
    });
  });

  it("states no answer when the comparison could not be made", async () => {
    const { actions } = build({
      world: (git) => {
        git.unproposed = { tdd: null };
      },
    });

    expect(await actions.unproposedFiles(skillRef("tdd"))).toEqual({
      ok: false,
      error: "no-answer",
    });
  });

  it("refuses a name that is not a skill", async () => {
    const { actions } = build();

    expect(await actions.unproposedFiles(skillRef("../etc"))).toEqual({
      ok: false,
      error: "invalid-skill",
    });
  });
});
