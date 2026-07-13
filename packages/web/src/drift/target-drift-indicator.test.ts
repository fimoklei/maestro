import { describe, expect, it } from "vitest";
import { targetDriftIndicator } from "./target-drift-indicator";

const deployed = (names: string[], skippedCount = 0) =>
  ({ status: "ready", names, skippedCount }) as const;

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

  it("reports ok when the check ran and nothing deployed is behind", () => {
    expect(
      targetDriftIndicator(deployed(["tdd"]), { status: "ready", behind: [] }),
    ).toBe("ok");
  });

  it("reports unknown when the drift check could not run", () => {
    expect(targetDriftIndicator(deployed(["tdd"]), { status: "unknown" })).toBe(
      "unknown",
    );
  });

  it("reports pending while the drift check is in flight", () => {
    expect(targetDriftIndicator(deployed(["tdd"]), { status: "pending" })).toBe(
      "pending",
    );
  });

  it("reports empty for a confirmed-empty target even when the drift check failed", () => {
    // A freshly-added repo has nothing deployed; its drift check cannot run and
    // reports unknown. You can't drift what you haven't deployed, so a
    // confirmed-empty deployment wins over the failed check — "empty", never the
    // "unknown" that reads as something went wrong.
    expect(targetDriftIndicator(deployed([]), { status: "unknown" })).toBe(
      "empty",
    );
  });

  it("reports empty for a confirmed-empty target while the drift check is in flight", () => {
    // Nothing is deployed, so there is nothing to check — no need to flash
    // "checking…" first.
    expect(targetDriftIndicator(deployed([]), { status: "pending" })).toBe(
      "empty",
    );
  });

  it("does not report empty for a target that has only skipped, unsupported primitives", () => {
    // A lockfile of only unsupported types comes back as zero primitives but a
    // non-empty skipped set — the target does contain deployed content, so it is
    // not empty (mirrors deploy-state-list's isEmpty rule). It falls through to
    // the drift-derived status instead; with a clean check that is "ok".
    expect(
      targetDriftIndicator(deployed([], 1), { status: "ready", behind: [] }),
    ).toBe("ok");
  });

  it("does not claim empty until deploy-state is confirmed, even with a clean check", () => {
    // Emptiness needs a confirmed read: while deploy-state is still loading we
    // don't yet know the target is empty, so a clean drift check must not be
    // short-circuited to "empty" — it stays "pending" until the read lands.
    expect(
      targetDriftIndicator(
        { status: "pending" },
        { status: "ready", behind: [] },
      ),
    ).toBe("pending");
  });

  it("reports empty for a confirmed-empty target even when the check names an orphan-behind", () => {
    // A behind name that is not deployed here cannot apply — with nothing
    // deployed the target is empty, not "in sync".
    expect(
      targetDriftIndicator(deployed([]), {
        status: "ready",
        behind: [{ name: "foo", current: "v0.5.0", latest: "v0.5.1" }],
      }),
    ).toBe("empty");
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
