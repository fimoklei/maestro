import { describe, expect, it } from "vitest";
import { targetDriftIndicator } from "./target-drift-indicator";

describe("targetDriftIndicator", () => {
  it("reports drift when any skill is behind", () => {
    expect(
      targetDriftIndicator({
        status: "ready",
        behind: [{ name: "tdd", current: "v0.5.0", latest: "v0.5.1" }],
      }),
    ).toBe("drift");
  });

  it("reports ok when the check ran and nothing is behind", () => {
    expect(targetDriftIndicator({ status: "ready", behind: [] })).toBe("ok");
  });

  it("reports unknown when the check could not run", () => {
    expect(targetDriftIndicator({ status: "unknown" })).toBe("unknown");
  });

  it("reports pending while the check is in flight", () => {
    expect(targetDriftIndicator({ status: "pending" })).toBe("pending");
  });
});
