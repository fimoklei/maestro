import { describe, expect, it } from "vitest";
import { inMemoryApp } from "../helpers/in-memory-app";

// One table over every POST route, so the shared parse step cannot drift a
// route's status, code or wording (#434).
describe("POST body parsing", () => {
  const PATH_SHAPE = {
    message:
      "Maestro did not receive a folder. Reload the page, then choose a folder again.",
    detail: "The request carries a path: { path: string }.",
  };
  const TARGET_SHAPE = {
    message:
      "Maestro could not start this change. Reload the page, then try again.",
    detail:
      'The request carries a type, a name and a target: { kind: "repo", repoPath } or { kind: "global" }.',
  };
  const BULK_SHAPE = {
    message:
      "Nothing was deployed. Reload the page, then stage the skills again.",
    detail:
      'The request carries a non-empty names array and a target: { kind: "repo", repoPath } or { kind: "global" }.',
  };
  const PROPOSAL_SHAPE = {
    message:
      "Maestro could not change the pull request. Reload the page, then try again.",
    detail:
      'The request carries a type, a name and a pull-request number: { type: "skill" | "prompt", name: string, number: number }.',
  };

  const WITHDRAW_SHAPE = {
    message:
      "Nothing was withdrawn. Reload the page, then withdraw the proposal again.",
    detail:
      'The request carries a type, a name and a pull-request number or null: { type: "skill" | "prompt", name: string, number: number | null }.',
  };

  const PROMPT_SHAPE = {
    message:
      "Nothing was imported. Reload the page, then import the prompt again.",
    detail:
      "The request carries a name, a description and a text: { name: string, description: string, text: string }.",
  };

  const PROMPT_CHECK_SHAPE = {
    message:
      "Nothing was checked. Reload the page, then check the prompt name again.",
    detail: "The request carries a name: { name: string }.",
  };

  const PROMPT_READ_SHAPE = {
    message:
      "Nothing was read. Reload the page, then select Edit prompt again.",
    detail: "The request carries a name: { name: string }.",
  };

  const PROMPT_EDIT_SHAPE = {
    message:
      "Nothing was edited. Reload the page, then select Edit prompt again.",
    detail:
      "The request carries a name, a description, a text and the prompt as read: { name: string, description: string, text: string, read: { description: string, text: string } }.",
  };

  const routes = [
    { path: "/api/inventory/connect", shape: PATH_SHAPE },
    { path: "/api/folder-chooser", shape: PATH_SHAPE },
    { path: "/api/registry/repos", shape: PATH_SHAPE },
    { path: "/api/deploy", shape: TARGET_SHAPE },
    { path: "/api/deploy/remove", shape: TARGET_SHAPE },
    { path: "/api/deploy/remove/preflight", shape: TARGET_SHAPE },
    { path: "/api/deploy/bulk", shape: BULK_SHAPE },
    { path: "/api/harness/proposal/reopen", shape: PROPOSAL_SHAPE },
    { path: "/api/harness/proposal/withdraw", shape: WITHDRAW_SHAPE },
    { path: "/api/harness/prompt/import", shape: PROMPT_SHAPE },
    { path: "/api/harness/prompt/check", shape: PROMPT_CHECK_SHAPE },
    { path: "/api/harness/prompt/read", shape: PROMPT_READ_SHAPE },
    { path: "/api/harness/prompt/edit", shape: PROMPT_EDIT_SHAPE },
  ];

  const makeApp = () => inMemoryApp();

  const post = (body: string) =>
    ({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }) as const;

  for (const route of routes) {
    it(`answers 400 with the route's own message when ${route.path} gets a body of the wrong shape`, async () => {
      const res = await makeApp().request(
        route.path,
        post(JSON.stringify({ unexpected: true })),
      );

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: "invalid-body",
        ...route.shape,
      });
    });

    it(`answers 400 rather than throwing when ${route.path} gets text that is not JSON`, async () => {
      const res = await makeApp().request(route.path, post("not json"));

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: "invalid-body",
        ...route.shape,
      });
    });
  }

  // A per-item request names the primitive's type as well as its name.
  const perItemRoutes = [
    { path: "/api/harness/promote", body: {} },
    { path: "/api/harness/promote/deletion", body: { seenRemoteTree: "t" } },
    { path: "/api/harness/primitive/delete", body: { seenWorkingTree: "t" } },
    { path: "/api/harness/primitive/restore", body: { seenHeadCommit: "c" } },
    { path: "/api/harness/primitive/discard", body: { seenRemoteTree: "t" } },
    { path: "/api/harness/proposal/create", body: {} },
    { path: "/api/harness/proposal/reopen", body: { number: 7 } },
    { path: "/api/harness/proposal/withdraw", body: { number: 7 } },
  ];

  for (const route of perItemRoutes) {
    it(`refuses a body on ${route.path} that names no known type`, async () => {
      for (const type of [undefined, "agent"]) {
        const res = await makeApp().request(
          route.path,
          post(JSON.stringify({ ...route.body, name: "tdd", type })),
        );

        expect(res.status).toBe(400);
        expect(await res.json()).toMatchObject({ error: "invalid-body" });
      }
    });
  }

  // A branch with no open request is withdrawn without a number (#1639).
  it("passes a withdrawal with a null number through to the use case", async () => {
    const res = await makeApp().request(
      "/api/harness/proposal/withdraw",
      post(JSON.stringify({ type: "skill", name: "tdd", number: null })),
    );

    expect(await res.json()).not.toMatchObject({ error: "invalid-body" });
  });

  // The edge applies the prompt field rules core applies again.
  it.each([
    ["an uppercase name", { name: "Review-PR" }],
    ["a name that climbs out", { name: "../x" }],
    ["a description holding a line break", { description: "a\n---" }],
    ["an empty text", { text: "" }],
    ["a text over 100 KB", { text: "é".repeat(60_000) }],
    ["a body without front matter", { frontmatter: undefined }],
  ])("refuses %s on the prompt import at the edge", async (_, change) => {
    const res = await makeApp().request(
      "/api/harness/prompt/import",
      post(
        JSON.stringify({
          name: "review-pr",
          frontmatter: "",
          description: "Review a pull request.",
          text: "Review $ARGUMENTS.",
          ...change,
        }),
      ),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "invalid-body",
      ...PROMPT_SHAPE,
    });
  });

  it.each([
    ["an uppercase name", { name: "Review-PR" }],
    ["a description holding a line break", { description: "a\n---" }],
    ["an empty text", { text: "" }],
    [
      "a read text over 100 KB",
      { read: { description: "Old", text: "é".repeat(60_000) } },
    ],
    [
      "a read description over 100 KB",
      { read: { description: "é".repeat(60_000), text: "Old." } },
    ],
  ])("refuses %s on the prompt edit at the edge", async (_, change) => {
    const res = await makeApp().request(
      "/api/harness/prompt/edit",
      post(
        JSON.stringify({
          name: "review-pr",
          description: "Review a pull request.",
          text: "Review $ARGUMENTS.",
          read: { description: "Old", text: "Old." },
          ...change,
        }),
      ),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "invalid-body",
      ...PROMPT_EDIT_SHAPE,
    });
  });

  it("refuses a front matter and text past 100 KB together as the text over 100 KB", async () => {
    const res = await makeApp().request(
      "/api/harness/prompt/import",
      post(
        JSON.stringify({
          name: "review-pr",
          frontmatter: `description: Review\nnotes: ${"n".repeat(60_000)}`,
          description: "Review a pull request.",
          text: "t".repeat(60_000),
        }),
      ),
    );

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "long-text" });
  });

  // The expected shape rides in `detail` (#681).
  it("keeps the expected shape out of every request-shape sentence", async () => {
    for (const route of routes) {
      const res = await makeApp().request(
        route.path,
        post(JSON.stringify({ unexpected: true })),
      );
      const body = (await res.json()) as { message: string; detail: string };

      expect(body.message).not.toMatch(/[{}:]/);
      expect(body.detail).toMatch(/\{/);
    }
  });

  // Setting the Harness location never clones (#995).
  it("refuses a URL on connect when the body asks for a local clone only", async () => {
    const res = await makeApp().request(
      "/api/inventory/connect",
      post(
        JSON.stringify({
          path: "https://github.com/fimoklei/agent-harness",
          localOnly: true,
        }),
      ),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "not-a-folder-path" });
  });
});
