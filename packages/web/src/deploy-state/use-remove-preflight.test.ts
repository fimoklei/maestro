import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../test-utils";
import {
  readRemovePreflight,
  removePreflightQueryOptions,
} from "./use-remove-preflight";

describe("readRemovePreflight", () => {
  it("reads the per-tool answer of the global scope", () => {
    expect(
      readRemovePreflight({
        check: {
          scope: "global",
          tools: [
            { tool: "claude", warning: null },
            { tool: "codex", warning: "cannot-verify-local-edits" },
          ],
        },
        reclaim: null,
      }),
    ).toEqual({
      check: {
        scope: "global",
        tools: [
          { tool: "claude", warning: null },
          { tool: "codex", warning: "cannot-verify-local-edits" },
        ],
      },
      reclaim: null,
    });
  });

  it("reads the leftover copies named beside the cost", () => {
    expect(
      readRemovePreflight({
        check: { scope: "global", tools: [{ tool: "codex", warning: null }] },
        reclaim: {
          previews: [{ tool: "claude", path: "/home/.claude/skills/tdd" }],
          token: "b".repeat(64),
        },
      }),
    ).toMatchObject({
      reclaim: {
        previews: [{ tool: "claude", path: "/home/.claude/skills/tdd" }],
        token: "b".repeat(64),
      },
    });
  });

  describe("fails closed on a body this build cannot read", () => {
    it.each([
      [
        "a warning it does not know",
        { check: { scope: "repo", warning: "copy-on-fire" }, reclaim: null },
      ],
      [
        "a per-tool row with a warning it does not know",
        {
          check: {
            scope: "global",
            tools: [
              { tool: "claude", warning: null },
              { tool: "codex", warning: "copy-on-fire" },
            ],
          },
        },
      ],
      [
        "a warning named like a built-in property",
        { check: { scope: "repo", warning: "toString" } },
      ],
      ["a repo answer with no warning", { check: { scope: "repo" } }],
      [
        "a per-tool row with no warning",
        { check: { scope: "global", tools: [{ tool: "claude" }] } },
      ],
      [
        "a per-tool row with no tool, dropping every row",
        {
          check: {
            scope: "global",
            tools: [{ tool: "claude", warning: null }, { warning: null }],
          },
        },
      ],
      ["an answer with no check in it", { reclaim: null }],
      ["a scope it has never heard of", { check: { scope: "per-machine" } }],
      [
        "a global answer carrying no tool list",
        { check: { scope: "global", tools: null } },
      ],
      [
        "leftovers it cannot read",
        {
          check: { scope: "repo", warning: null },
          reclaim: { previews: [{ tool: "claude" }], token: "b".repeat(64) },
        },
      ],
      [
        "a receipt that is not a string",
        { check: { scope: "repo", warning: null }, receipt: 7 },
      ],
      ["a body that is not an object", null],
      ["a string body", "nope"],
    ])("%s", (_case, body) => {
      expect(readRemovePreflight(body)).toBeNull();
    });
  });
});

describe("the remove preflight query", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const fetchPreflight = (body: unknown) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(body, 200)),
    );
    return removePreflightQueryOptions("tdd", {
      kind: "repo",
      repoPath: "/Users/me/app",
    }).queryFn();
  };

  it("fails on a 200 this build cannot read, so the check reads as not run", async () => {
    await expect(
      fetchPreflight({
        check: { scope: "repo", warning: "copy-on-fire" },
        reclaim: null,
      }),
    ).rejects.toThrow();
  });

  it("returns the answer it read", async () => {
    await expect(
      fetchPreflight({
        check: { scope: "repo", warning: "cannot-verify-local-edits" },
        reclaim: null,
        receipt: "r1",
      }),
    ).resolves.toEqual({
      check: { scope: "repo", warning: "cannot-verify-local-edits" },
      reclaim: null,
      receipt: "r1",
    });
  });
});
