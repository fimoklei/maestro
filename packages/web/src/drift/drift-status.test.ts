import { describe, expect, it } from "vitest";
import { type DriftView, orphanBehind, skillDriftStatus } from "./drift-status";

// Behind names are carried as deployed -> latest version pairs (ADR-0007); the
// per-skill status derives from the name, so these tests name the behind skills
// and let the helper attach a placeholder pair.
const ready = (names: string[]): DriftView => ({
  status: "ready",
  behind: names.map((name) => ({ name, current: "v1.0.0", latest: "v1.1.0" })),
});

describe("skillDriftStatus", () => {
  it("reports a deployed skill in the behind set as behind", () => {
    expect(skillDriftStatus("tdd", ready(["tdd"]))).toBe("behind");
  });

  it("reports a deployed skill not in the behind set as up-to-date", () => {
    expect(skillDriftStatus("tdd", ready(["diagnose"]))).toBe("up-to-date");
  });

  it("reports unknown when the check could not run", () => {
    expect(skillDriftStatus("tdd", { status: "unknown" })).toBe("unknown");
  });

  it("reports pending while the check is still in flight", () => {
    expect(skillDriftStatus("tdd", { status: "pending" })).toBe("pending");
  });

  it("never derives up-to-date from an unknown check", () => {
    // The failure mode J04 exists to prevent: a failed check must not read as
    // up-to-date.
    expect(skillDriftStatus("tdd", { status: "unknown" })).not.toBe(
      "up-to-date",
    );
  });
});

describe("orphanBehind", () => {
  it("surfaces behind names that are not deployed in the repo", () => {
    expect(orphanBehind(["tdd"], ready(["tdd", "foo"]))).toEqual(["foo"]);
  });

  it("is empty when every behind name is a deployed skill", () => {
    expect(orphanBehind(["tdd"], ready(["tdd"]))).toEqual([]);
  });

  it("is empty when the check has not produced a behind set", () => {
    expect(orphanBehind(["tdd"], { status: "unknown" })).toEqual([]);
    expect(orphanBehind(["tdd"], { status: "pending" })).toEqual([]);
  });
});
