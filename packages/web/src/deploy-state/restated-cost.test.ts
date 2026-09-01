import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import { restatedCost } from "./restated-cost";

const refusal = (body: unknown) =>
  new HttpError(409, "sent by the server", "cost-not-acknowledged", body);

// Written in `notice-copy.ts`, never in the reply the server sends (#684).
const RESTATED =
  "The copy on disk is no longer the one this removal was priced against, so nothing was deleted. The list beside this states what a removal would cost now — confirm it to go ahead.";

const RECEIPT = "a".repeat(64);

describe("restatedCost", () => {
  it("reads the cost the server found and the receipt that confirms it", () => {
    expect(
      restatedCost(
        refusal({
          check: { scope: "repo", warning: "local-edits-will-be-lost" },
          receipt: RECEIPT,
        }),
      ),
    ).toEqual({
      check: { scope: "repo", warning: "local-edits-will-be-lost" },
      receipt: RECEIPT,
      // The copy module's sentence travels with the cost it explains.
      reclaim: null,
      message: RESTATED,
    });
  });

  it("reads the per-tool answer the global scope restates", () => {
    expect(
      restatedCost(
        refusal({
          check: {
            scope: "global",
            tools: [
              { tool: "claude", warning: null },
              { tool: "codex", warning: "cannot-verify-local-edits" },
            ],
          },
          receipt: RECEIPT,
        }),
      ),
    ).toEqual({
      check: {
        scope: "global",
        tools: [
          { tool: "claude", warning: null },
          { tool: "codex", warning: "cannot-verify-local-edits" },
        ],
      },
      receipt: RECEIPT,
      reclaim: null,
      message: RESTATED,
    });
  });

  it("ignores any other refusal, however well-formed its body", () => {
    expect(
      restatedCost(
        new HttpError(409, "still there", "remove-failed", {
          check: { scope: "repo", warning: null },
          receipt: RECEIPT,
        }),
      ),
    ).toBeNull();
  });

  // Half a restatement is none: a cost with no receipt names a price the
  // confirmation cannot pay, and a receipt with no cost is a blank cheque.
  it("drops a restatement that carries no receipt", () => {
    expect(
      restatedCost(refusal({ check: { scope: "repo", warning: null } })),
    ).toBeNull();
  });

  it("drops a cost this build cannot read, rather than guessing it clean", () => {
    expect(
      restatedCost(
        refusal({
          check: { scope: "repo", warning: "some-future-warning" },
          receipt: RECEIPT,
        }),
      ),
    ).toBeNull();
  });

  it("drops a per-tool answer with an unreadable row, and not just that row", () => {
    expect(
      restatedCost(
        refusal({
          check: {
            scope: "global",
            tools: [{ tool: "claude", warning: null }, { warning: null }],
          },
          receipt: RECEIPT,
        }),
      ),
    ).toBeNull();
  });

  // The leftovers travel with the cost, so a confirmation can never name a
  // copy under one attempt's cost and delete it under another's consent.
  it("reads the leftover copies the refusal named beside the cost", () => {
    expect(
      restatedCost(
        refusal({
          check: { scope: "global", tools: [{ tool: "codex", warning: null }] },
          receipt: RECEIPT,
          reclaim: {
            previews: [{ tool: "claude", path: "/home/.claude/skills/tdd" }],
            token: "b".repeat(64),
          },
        }),
      ),
    ).toMatchObject({
      reclaim: {
        previews: [{ tool: "claude", path: "/home/.claude/skills/tdd" }],
        token: "b".repeat(64),
      },
    });
  });

  it("drops a restatement whose leftovers it cannot read", () => {
    expect(
      restatedCost(
        refusal({
          check: { scope: "repo", warning: null },
          receipt: RECEIPT,
          reclaim: { previews: [{ tool: "claude" }], token: "b".repeat(64) },
        }),
      ),
    ).toBeNull();
  });

  it("ignores a failure that never came from the server", () => {
    expect(restatedCost(new Error("offline"))).toBeNull();
  });
});
