// Proposing a prompt change: the composition over the in-memory Harness.
import {
  composeUseCases,
  type HarnessStageRead,
  type HarnessStageRow,
  type ReviewRequest,
} from "@maestro/core";
import { describe, expect, it } from "vitest";
import { InMemoryHarnessGit } from "../../packages/core/src/harness/harness-git.fake";
import { InMemoryFileSystem } from "../../packages/core/src/registry/file-system.fake";
import { inMemoryPorts } from "../helpers/in-memory-app";
import { stubReview } from "../helpers/stub-review";

const HARNESS = "/harness";
const PROMPT = { type: "prompt", name: "pr-review" } as const;

const request = (over: Partial<ReviewRequest> = {}): ReviewRequest => ({
  number: 45,
  url: "https://github.com/fimoklei/agent-harness/pull/45",
  state: "open",
  draft: false,
  decision: null,
  reviewers: [],
  headOwner: "fimoklei",
  headRepo: "agent-harness",
  headBranch: "maestro/prompt.pr-review",
  headCommit: "3d0f1a9c5b7e2846f0a1c3d5e7b9081726354adf",
  baseBranch: "main",
  author: "fimoklei",
  title: "Add prompt: pr-review",
  ...over,
});

// One released commit everywhere; the test then edits the working clone.
const world = () => {
  const harness = new InMemoryHarnessGit().settled(
    { tdd: "tdd as released" },
    "released",
    { "pr-review": "Review $ARGUMENTS\n" },
  );
  harness.tags = [{ name: "v1.0.0", commit: "released" }];
  const review = stubReview();
  const useCases = composeUseCases(
    inMemoryPorts({
      env: {
        HOME: "/home",
        MAESTRO_HOME: "/maestro-home",
        MAESTRO_INVENTORY_PATH: HARNESS,
      },
      fs: new InMemoryFileSystem({ directories: { [HARNESS]: HARNESS } }),
      git: { harness },
      gh: review,
    }),
  );
  return { harness, review, useCases };
};

const rowsOf = (stage: HarnessStageRead): HarnessStageRow[] =>
  stage.outcome === "read" ? stage.rows : [];

const stagesOf = async (useCases: ReturnType<typeof world>["useCases"]) => {
  const read = await useCases.harness.execute();
  if (!read.ok) {
    throw new Error(`unread Harness: ${read.error}`);
  }
  return read.state.stages;
};

const facts = (row: HarnessStageRow) => ({
  stage: row.stage,
  type: row.type,
  name: row.name,
  change: row.change,
  status: row.status,
  branch: row.branch,
});

describe("proposing a prompt change", () => {
  it("shows an edited prompt in Pending proposal on its own branch", async () => {
    const { harness, useCases } = world();
    harness.workingPrompts = { "pr-review": "Review $ARGUMENTS twice\n" };

    const stages = await stagesOf(useCases);

    expect(rowsOf(stages.proposal).map(facts)).toEqual([
      {
        stage: "pending-proposal",
        type: "prompt",
        name: "pr-review",
        change: "edit",
        status: "not-yet-proposed",
        branch: "maestro/prompt.pr-review",
      },
    ]);
  });

  it("shows an added prompt in Pending proposal as an addition", async () => {
    const { harness, useCases } = world();
    harness.workingPrompts = {
      ...harness.workingPrompts,
      "fix-ci": "Fix the build\n",
    };

    const stages = await stagesOf(useCases);

    expect(rowsOf(stages.proposal).map(facts)).toEqual([
      {
        stage: "pending-proposal",
        type: "prompt",
        name: "fix-ci",
        change: "addition",
        status: "not-yet-proposed",
        branch: "maestro/prompt.fix-ci",
      },
    ]);
  });

  it("pushes the prompt to maestro/prompt.<name> and opens a pull request titled Edit prompt", async () => {
    const { harness, review, useCases } = world();
    harness.workingPrompts = { "pr-review": "Review $ARGUMENTS twice\n" };

    await expect(useCases.promote.execute(PROMPT)).resolves.toMatchObject({
      ok: true,
      branch: "maestro/prompt.pr-review",
    });

    expect(Object.keys(harness.promote)).toEqual(["prompt.pr-review"]);
    expect(review.created).toEqual([
      expect.objectContaining({
        head: "maestro/prompt.pr-review",
        title: "Edit prompt: pr-review",
      }),
    ]);
  });

  it("titles a new prompt's pull request Add prompt", async () => {
    const { harness, review, useCases } = world();
    harness.workingPrompts = { ...harness.workingPrompts, "fix-ci": "Fix\n" };

    await useCases.promote.execute({ type: "prompt", name: "fix-ci" });

    expect(review.created.map((each) => each.title)).toEqual([
      "Add prompt: fix-ci",
    ]);
  });

  it("gives a skill and a prompt with one name two branches", async () => {
    const { harness, useCases } = world();
    harness.working = { ...harness.working, "pr-review": "a skill" };
    harness.workingPrompts = { "pr-review": "Review $ARGUMENTS twice\n" };

    await useCases.promote.execute({ type: "skill", name: "pr-review" });
    await useCases.promote.execute(PROMPT);

    expect(Object.keys(harness.promote).sort()).toEqual([
      "pr-review",
      "prompt.pr-review",
    ]);
    const stages = await stagesOf(useCases);
    expect(
      rowsOf(stages.review).map(({ type, name, branch }) => [
        type,
        name,
        branch,
      ]),
    ).toEqual(
      expect.arrayContaining([
        ["skill", "pr-review", "maestro/pr-review"],
        ["prompt", "pr-review", "maestro/prompt.pr-review"],
      ]),
    );
  });

  it("retitles Maestro's own Add prompt title to Edit prompt on Update proposal", async () => {
    const { harness, review, useCases } = world();
    harness.workingPrompts = { "pr-review": "Review $ARGUMENTS twice\n" };
    review.answer({
      outcome: "read",
      requests: [request({ title: "Add prompt: pr-review" })],
      complete: true,
      limit: 100,
    });

    await useCases.promote.execute(PROMPT);

    expect(review.created).toEqual([]);
    expect(review.edited).toEqual([
      { number: 45, title: "Edit prompt: pr-review" },
    ]);
  });
});

describe("a prompt in Pending review", () => {
  // The prompt is pushed, then GitHub answers with `requests`.
  const proposed = async (requests: ReviewRequest[]) => {
    const setup = world();
    setup.harness.workingPrompts = {
      "pr-review": "Review $ARGUMENTS twice\n",
    };
    await setup.useCases.promote.execute(PROMPT);
    setup.review.answer({
      outcome: "read",
      requests,
      complete: true,
      limit: 100,
    });
    return setup;
  };

  it.each<[Partial<ReviewRequest>, string]>([
    [{ draft: true }, "draft"],
    [{ decision: "review-required" }, "waiting-for-review"],
    [{ decision: "changes-requested" }, "changes-requested"],
    [{ decision: "approved" }, "approved-awaiting-merge"],
    [{ state: "closed" }, "proposal-closed"],
  ])("reads %o as %s, as a skill's would", async (over, status) => {
    const { useCases } = await proposed([request(over)]);

    const stages = await stagesOf(useCases);

    expect(rowsOf(stages.review).map(facts)).toEqual([
      {
        stage: "pending-review",
        type: "prompt",
        name: "pr-review",
        change: "edit",
        status,
        branch: "maestro/prompt.pr-review",
      },
    ]);
  });

  it("reads a pushed prompt branch without a pull request as Pull request missing, and Create pull request opens one", async () => {
    const { review, useCases } = await proposed([]);
    review.created.length = 0;

    const stages = await stagesOf(useCases);
    expect(rowsOf(stages.review).map((row) => row.status)).toEqual([
      "pull-request-missing",
    ]);

    await expect(useCases.proposals.create(PROMPT)).resolves.toEqual({
      ok: true,
    });
    expect(review.created).toEqual([
      expect.objectContaining({
        head: "maestro/prompt.pr-review",
        title: "Edit prompt: pr-review",
      }),
    ]);
  });

  it("reopens a closed prompt pull request", async () => {
    const { review, useCases } = await proposed([request({ state: "closed" })]);

    await expect(useCases.proposals.reopen(PROMPT, 45)).resolves.toEqual({
      ok: true,
    });
    expect(review.reopened).toEqual([45]);
  });

  it("withdraws an open prompt pull request", async () => {
    const { review, useCases } = await proposed([request()]);

    await expect(useCases.proposals.withdraw(PROMPT, 45)).resolves.toEqual({
      ok: true,
    });
    expect(review.closed).toEqual([45]);
  });

  it("never matches a skill's pull request with the same name", async () => {
    const { review, useCases } = await proposed([
      request({
        headBranch: "maestro/pr-review",
        title: "Edit skill: pr-review",
      }),
    ]);

    await expect(useCases.proposals.withdraw(PROMPT, 45)).resolves.toEqual({
      ok: false,
      error: "request-gone",
    });
    expect(review.closed).toEqual([]);
  });
});

describe("Also in", () => {
  it("names only stages holding the same type and name", async () => {
    const { harness, review, useCases } = world();
    // A skill pr-review waits in review; the prompt pr-review is local work.
    harness.working = { ...harness.working, "pr-review": "a skill" };
    await useCases.promote.execute({ type: "skill", name: "pr-review" });
    review.answer({
      outcome: "read",
      requests: [
        request({
          headBranch: "maestro/pr-review",
          title: "Add skill: pr-review",
        }),
      ],
      complete: true,
      limit: 100,
    });
    harness.workingPrompts = { "pr-review": "Review $ARGUMENTS twice\n" };

    const stages = await stagesOf(useCases);

    const prompt = rowsOf(stages.proposal).find((row) => row.type === "prompt");
    expect(prompt?.alsoIn).toEqual([]);
    const skill = rowsOf(stages.review).find((row) => row.type === "skill");
    expect(skill?.alsoIn).toEqual([]);
  });
});
