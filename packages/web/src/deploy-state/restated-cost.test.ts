import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import { restatedCost } from "./restated-cost";

const refusal = (body: unknown) =>
  new HttpError(409, "sent by the server", "cost-not-acknowledged", body);

const RECEIPT = "a".repeat(64);

describe("restatedCost", () => {
  it("reads the cost the server found and the receipt that confirms it", () => {
    expect(
      restatedCost(
        refusal({
          check: { scope: "repo", warning: "cannot-verify-local-edits" },
          receipt: RECEIPT,
        }),
      ),
    ).toEqual({
      check: { scope: "repo", warning: "cannot-verify-local-edits" },
      receipt: RECEIPT,
      reclaim: null,
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

  it("ignores a failure that never came from the server", () => {
    expect(restatedCost(new Error("offline"))).toBeNull();
  });
});
