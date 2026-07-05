import { describe, expect, it } from "vitest";
import { targetDriftIndicator } from "./target-drift-indicator";

const deployed = (names: string[]) => ({ status: "ready", names }) as const;

describe("targetDriftIndicator", () => {
  it("reports drift when a deployed skill is behind", () => {
    expect(
      targetDriftIndicator(deployed(["tdd"]), {
        status: "ready",
        behind: [{ name: "tdd", current: "v0.5.0", latest: "v0.5.1" }],
      }),
    ).toBe("drift");
  });

  it("does not report drift for an orphan-behind primitive", () => {
    expect(
      targetDriftIndicator(deployed(["tdd"]), {
        status: "ready",
        behind: [{ name: "foo", current: "v0.5.0", latest: "v0.5.1" }],
      }),
    ).toBe("ok");
  });

  it("reports ok when the check ran and nothing is behind", () => {
    expect(
      targetDriftIndicator(deployed([]), { status: "ready", behind: [] }),
    ).toBe("ok");
  });

  it("reports unknown when the drift check could not run", () => {
    expect(targetDriftIndicator(deployed([]), { status: "unknown" })).toBe(
      "unknown",
    );
  });

  it("reports pending while the drift check is in flight", () => {
    expect(targetDriftIndicator(deployed([]), { status: "pending" })).toBe(
      "pending",
    );
  });

  it("reports unverified when apm could not reach the source", () => {
    // Surfaces regardless of the deployed set — like unknown, it must never read
    // as in sync (J04), but stays distinct so the roll-up reflects auth/network.
    expect(
      targetDriftIndicator(deployed(["tdd"]), { status: "unverified" }),
    ).toBe("unverified");
  });

  it("stays pending when deploy-state is still loading, even with a behind entry", () => {
    expect(
      targetDriftIndicator(
        { status: "pending" },
        {
          status: "ready",
          behind: [{ name: "tdd", current: "v0.5.0", latest: "v0.5.1" }],
        },
      ),
    ).toBe("pending");
  });

  it("reports unknown when deploy-state could not be read, never silently ok", () => {
    expect(
      targetDriftIndicator(
        { status: "unknown" },
        {
          status: "ready",
          behind: [{ name: "tdd", current: "v0.5.0", latest: "v0.5.1" }],
        },
      ),
    ).toBe("unknown");
  });
});
