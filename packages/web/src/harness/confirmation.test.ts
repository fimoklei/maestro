import { describe, expect, it } from "vitest";
import { type Confirmation, closed, targetOf } from "./confirmation";

const restore: Confirmation = {
  kind: "restore",
  target: {
    type: "skill",
    name: "tdd",
    path: "skills/tdd",
    commit: "abc123",
    hasRequest: false,
  },
};

describe("confirmation", () => {
  it("gives the standing confirmation's target to its own kind only", () => {
    expect(targetOf(restore, "restore")?.commit).toBe("abc123");
    expect(targetOf(restore, "discard")).toBeNull();
    expect(targetOf(null, "restore")).toBeNull();
  });

  it("closes the standing confirmation by its own kind", () => {
    expect(closed(restore, "restore")).toBeNull();
  });

  it("leaves the standing confirmation when another kind closes", () => {
    expect(closed(restore, "discard")).toBe(restore);
  });
});
