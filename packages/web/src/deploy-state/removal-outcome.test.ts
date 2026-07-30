import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import { removalOutcome } from "./removal-outcome";

const failure = (body: unknown) =>
  new HttpError(502, "apm did not confirm the removal.", "remove-failed", body);

describe("removalOutcome", () => {
  it("reads the repo scope's single answer", () => {
    expect(
      removalOutcome(failure({ outcome: { scope: "repo", state: "removed" } })),
    ).toEqual({ scope: "repo", state: "removed" });
  });

  it("reads the global scope's answer per tool, in the order it was sent", () => {
    expect(
      removalOutcome(
        failure({
          outcome: {
            scope: "global",
            tools: [
              { tool: "codex", state: "not-removed" },
              { tool: "claude", state: "removed" },
            ],
          },
        }),
      ),
    ).toEqual({
      scope: "global",
      tools: [
        { tool: "codex", state: "not-removed" },
        { tool: "claude", state: "removed" },
      ],
    });
  });

  it("reports nothing when the failure carried no outcome", () => {
    expect(removalOutcome(failure({ error: "not-deployed" }))).toBeNull();
  });

  it("reports nothing for a failure that never reached the server", () => {
    expect(removalOutcome(new TypeError("network down"))).toBeNull();
  });

  // An outcome this build cannot read is one it cannot draw: a ledger built on
  // a guess would state something the server never proved (J04).
  it("drops a report carrying a state it does not recognise", () => {
    expect(
      removalOutcome(failure({ outcome: { scope: "repo", state: "maybe" } })),
    ).toBeNull();
    expect(
      removalOutcome(
        failure({
          outcome: {
            scope: "global",
            tools: [{ tool: "claude", state: "probably" }],
          },
        }),
      ),
    ).toBeNull();
  });

  it("drops a report whose shape it does not recognise", () => {
    for (const outcome of [
      { scope: "repo" },
      { scope: "global" },
      { scope: "elsewhere", state: "removed" },
      "removed",
    ]) {
      expect(removalOutcome(failure({ outcome }))).toBeNull();
    }
  });
});
