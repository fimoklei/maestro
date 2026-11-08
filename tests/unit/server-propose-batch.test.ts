// Propose changes over HTTP: the composition over the in-memory Harness, each
// item its own branch and pull request, streamed as each one finishes.
import type { ReviewRequest } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { InMemoryHarnessGit } from "../../packages/core/src/harness/harness-git.fake";
import { InMemoryFileSystem } from "../../packages/core/src/registry/file-system.fake";
import { inMemoryApp } from "../helpers/in-memory-app";
import { type StubReview, stubReview } from "../helpers/stub-review";

const HARNESS = "/harness";

type Ref = { type: "skill" | "prompt"; name: string };

// One released commit everywhere; each test then edits the working clone.
const world = (options: { review?: StubReview } = {}) => {
  const harness = new InMemoryHarnessGit().settled(
    { tdd: "tdd as released", "lint-fix": "lint as released" },
    "released",
    { "pr-review": "Review $ARGUMENTS\n" },
  );
  const review = options.review ?? stubReview();
  const env: NodeJS.ProcessEnv = {
    HOME: "/home",
    MAESTRO_HOME: "/maestro-home",
    MAESTRO_INVENTORY_PATH: HARNESS,
  };
  const app = inMemoryApp({
    env,
    fs: new InMemoryFileSystem({ directories: { [HARNESS]: HARNESS } }),
    git: { harness },
    gh: review,
  });
  return { app, harness, review, env };
};

// Every line the response streamed, parsed.
const proposeBatch = async (
  app: ReturnType<typeof world>["app"],
  items: unknown,
) => {
  const response = await app.request("/api/harness/promote/batch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items }),
  });
  const text = await response.text();
  const lines =
    response.status === 200
      ? text
          .split("\n")
          .filter((line) => line !== "")
          .map((line) => JSON.parse(line))
      : [];
  return { status: response.status, text, lines };
};

const reportOf = (lines: unknown[]) => {
  const last = lines.at(-1) as { report?: unknown } | undefined;
  return last?.report;
};

// The edits and additions most tests propose: two skills and a prompt.
const MIXED: Ref[] = [
  { type: "skill", name: "tdd" },
  { type: "skill", name: "code-review" },
  { type: "prompt", name: "pr-review" },
];

const editMixed = (harness: InMemoryHarnessGit) => {
  harness.working = {
    ...harness.working,
    tdd: "tdd, edited",
    "code-review": "a new skill",
  };
  harness.workingPrompts = { "pr-review": "Review $ARGUMENTS twice\n" };
};

const openRequest = (over: Partial<ReviewRequest>): ReviewRequest => ({
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
  title: "Edit skill: tdd",
  ...over,
});

describe("POST /api/harness/promote/batch", () => {
  it("proposes skills and prompts, additions and edits, each on its own branch and pull request", async () => {
    const { app, harness, review } = world();
    editMixed(harness);

    const { status, lines } = await proposeBatch(app, MIXED);

    expect(status).toBe(200);
    expect(
      harness.pushed.map(({ type, name, kind }) => [type, name, kind]),
    ).toEqual([
      ["skill", "tdd", "edit"],
      ["skill", "code-review", "addition"],
      ["prompt", "pr-review", "edit"],
    ]);
    expect(review.created.map((each) => each.title)).toEqual([
      "Edit skill: tdd",
      "Add skill: code-review",
      "Edit prompt: pr-review",
    ]);
    expect(reportOf(lines)).toEqual({
      proposed: [
        {
          type: "skill",
          name: "tdd",
          branch: "maestro/tdd",
          compareUrl:
            "https://github.com/fimoklei/agent-harness/compare/main...maestro/tdd?expand=1",
          pullRequest: {
            state: "opened",
            number: 101,
            url: "https://github.com/fimoklei/agent-harness/pull/101",
          },
        },
        {
          type: "skill",
          name: "code-review",
          branch: "maestro/code-review",
          compareUrl:
            "https://github.com/fimoklei/agent-harness/compare/main...maestro/code-review?expand=1",
          pullRequest: {
            state: "opened",
            number: 102,
            url: "https://github.com/fimoklei/agent-harness/pull/102",
          },
        },
        {
          type: "prompt",
          name: "pr-review",
          branch: "maestro/prompt.pr-review",
          compareUrl:
            "https://github.com/fimoklei/agent-harness/compare/main...maestro/prompt.pr-review?expand=1",
          pullRequest: {
            state: "opened",
            number: 103,
            url: "https://github.com/fimoklei/agent-harness/pull/103",
          },
        },
      ],
      failed: [],
    });
  });

  it("streams each item's outcome as it finishes, then the report", async () => {
    const { app, harness } = world();
    editMixed(harness);

    const { lines } = await proposeBatch(app, MIXED);

    expect(
      lines.map((line) =>
        "item" in line ? `${line.item.name}: ${line.item.ok}` : "report",
      ),
    ).toEqual(["tdd: true", "code-review: true", "pr-review: true", "report"]);
  });

  it("refuses nothing when a teammate merges another skill during the batch", async () => {
    const { app, harness } = world();
    editMixed(harness);
    // Lands with the batch's third fetch, before code-review's re-check: a
    // change to lint-fix only.
    harness.arrivals.push(
      () => {},
      () => {},
      () => {
        harness.commit(
          "merged-lint",
          { tdd: "tdd as released", "lint-fix": "lint, merged by a teammate" },
          {
            parent: "released",
            author: "teammate",
            prompts: { "pr-review": "Review $ARGUMENTS\n" },
          },
        );
        harness.tip = "merged-lint";
      },
    );

    const { lines } = await proposeBatch(app, MIXED);

    expect(harness.tip).toBe("merged-lint");
    expect(reportOf(lines)).toMatchObject({ failed: [] });
    expect(harness.pushed.map(({ name }) => name)).toEqual([
      "tdd",
      "code-review",
      "pr-review",
    ]);
  });

  it("lands the other items when one push fails, and collapses identical failures into one line", async () => {
    const { app, harness, review } = world();
    editMixed(harness);
    harness.working = { ...harness.working, "lint-fix": "lint, edited" };
    harness.pushOutcomes = {
      tdd: "push-failed",
      "prompt.pr-review": "push-failed",
    };

    const { status, lines } = await proposeBatch(app, [
      ...MIXED,
      { type: "skill", name: "lint-fix" },
    ]);

    expect(status).toBe(200);
    expect(harness.pushed.map(({ name }) => name)).toEqual([
      "code-review",
      "lint-fix",
    ]);
    expect(review.created.map((each) => each.head)).toEqual([
      "maestro/code-review",
      "maestro/lint-fix",
    ]);
    expect(reportOf(lines)).toMatchObject({
      proposed: [{ name: "code-review" }, { name: "lint-fix" }],
      failed: [
        {
          error: "promote-failed",
          items: [
            { type: "skill", name: "tdd" },
            { type: "prompt", name: "pr-review" },
          ],
        },
      ],
    });
  });

  it("opens no duplicate pull request when the batch runs again after a partial failure", async () => {
    const { app, harness, review } = world();
    editMixed(harness);
    harness.pushOutcomes = { tdd: "push-failed" };
    await proposeBatch(app, MIXED);
    // GitHub now holds the two requests the first run opened.
    review.answer({
      outcome: "read",
      complete: true,
      limit: 100,
      requests: [
        openRequest({
          number: 101,
          url: "https://github.com/fimoklei/agent-harness/pull/101",
          headBranch: "maestro/code-review",
          title: "Add skill: code-review",
        }),
        openRequest({
          number: 102,
          url: "https://github.com/fimoklei/agent-harness/pull/102",
          headBranch: "maestro/prompt.pr-review",
          title: "Edit prompt: pr-review",
        }),
      ],
    });
    harness.pushOutcomes = {};

    const { lines } = await proposeBatch(app, MIXED);

    expect(review.created.map((each) => each.head)).toEqual([
      "maestro/code-review",
      "maestro/prompt.pr-review",
      "maestro/tdd",
    ]);
    expect(reportOf(lines)).toMatchObject({
      proposed: [
        { name: "tdd", pullRequest: { state: "opened", number: 103 } },
        { name: "code-review", pullRequest: { state: "updated", number: 101 } },
        { name: "pr-review", pullRequest: { state: "updated", number: 102 } },
      ],
      failed: [],
    });
  });

  it("refuses an item that waits on another contributor's open proposal, and proposes the rest", async () => {
    const review = stubReview({
      outcome: "read",
      complete: true,
      limit: 100,
      requests: [openRequest({ author: "mvdberg", number: 198 })],
    });
    const { app, harness } = world({ review });
    editMixed(harness);

    const { lines } = await proposeBatch(app, MIXED);

    expect(harness.pushed.map(({ name }) => name)).toEqual([
      "code-review",
      "pr-review",
    ]);
    expect(reportOf(lines)).toMatchObject({
      failed: [
        {
          error: "proposed-by-other",
          items: [{ type: "skill", name: "tdd" }],
        },
      ],
    });
  });

  it("states an unusable name as that item's refusal", async () => {
    const { app, harness } = world();
    editMixed(harness);

    const { lines } = await proposeBatch(app, [
      { type: "skill", name: "Not A Slug" },
      { type: "skill", name: "tdd" },
    ]);

    expect(reportOf(lines)).toMatchObject({
      proposed: [{ name: "tdd" }],
      failed: [
        {
          error: "invalid-skill",
          items: [{ type: "skill", name: "Not A Slug" }],
        },
      ],
    });
  });
});

describe("POST /api/harness/promote/batch refusing the whole batch", () => {
  it("answers 409 before any push when no Harness is connected", async () => {
    const { app, harness, env } = world();
    delete env.MAESTRO_INVENTORY_PATH;
    editMixed(harness);

    const { status, text } = await proposeBatch(app, MIXED);

    expect(status).toBe(409);
    expect(JSON.parse(text)).toEqual({ error: "not-configured" });
    expect(harness.pushed).toEqual([]);
  });

  it("answers 422 before any push when the origin is not on GitHub", async () => {
    const { app, harness } = world();
    harness.originUrl = "/srv/git/harness.git";
    editMixed(harness);

    const { status, text } = await proposeBatch(app, MIXED);

    expect(status).toBe(422);
    expect(JSON.parse(text)).toEqual({ error: "no-usable-origin" });
    expect(harness.pushed).toEqual([]);
  });

  it("refuses a second batch while one runs", async () => {
    const { app, harness } = world();
    editMixed(harness);
    let release: () => void = () => {};
    harness.fetchHold = new Promise((resolve) => {
      release = resolve;
    });

    const first = proposeBatch(app, MIXED);
    const second = await proposeBatch(app, MIXED);
    release();
    await first;

    expect(second.status).toBe(409);
    expect(JSON.parse(second.text)).toEqual({ error: "promote-in-progress" });
    expect(harness.pushed.map(({ name }) => name)).toEqual([
      "tdd",
      "code-review",
      "pr-review",
    ]);
  });

  it("refuses an empty item list as a request-shape error", async () => {
    const { app } = world();

    const { status, text } = await proposeBatch(app, []);

    expect(status).toBe(400);
    expect(JSON.parse(text)).toMatchObject({ error: "invalid-body" });
  });

  it("refuses the whole list when one item names no known type", async () => {
    const { app, harness } = world();
    editMixed(harness);

    const { status, text } = await proposeBatch(app, [
      ...MIXED,
      { type: "agent", name: "tdd" },
    ]);

    expect(status).toBe(400);
    expect(JSON.parse(text)).toEqual({
      error: "invalid-body",
      message:
        "Nothing was proposed. Reload the page, then propose the changes again.",
      detail:
        'The request carries a non-empty items array, each item a type and a name: { items: { type: "skill" | "prompt", name: string }[] }.',
    });
    expect(harness.pushed).toEqual([]);
  });
});

describe("a batch of ten", () => {
  it("proposes ten items in the in-memory git world", async () => {
    const { app, harness } = world();
    const names = Array.from({ length: 10 }, (_, index) => `skill-${index}`);
    harness.working = {
      ...harness.working,
      ...Object.fromEntries(names.map((name) => [name, `# ${name}`])),
    };

    const { lines } = await proposeBatch(
      app,
      names.map((name) => ({ type: "skill", name })),
    );

    expect(lines.filter((line) => "item" in line)).toHaveLength(10);
    expect(reportOf(lines)).toMatchObject({ failed: [] });
    expect(harness.pushed).toHaveLength(10);
  });
});
