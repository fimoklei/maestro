import { describe, expect, it } from "vitest";
import { machineValues } from "../test-utils";
import { plainText } from "../ui/phrase";
import { harnessMetaLine } from "./use-harness-summary";

const line = (release: Parameters<typeof harnessMetaLine>[0]) => {
  const meta = harnessMetaLine(release);
  return meta === null ? null : plainText(meta);
};

describe("harnessMetaLine", () => {
  it("names the release alone, set apart as a machine value", () => {
    expect(line("v1.4.0")).toBe("v1.4.0");
    expect(machineValues(harnessMetaLine("v1.4.0") ?? "")).toEqual(["v1.4.0"]);
  });

  it("states a Harness with no release yet in plain words", () => {
    expect(line(null)).toBe("Not released yet");
    expect(machineValues(harnessMetaLine(null) ?? "")).toEqual([]);
  });

  it("states nothing while the release is unread", () => {
    // An unread release never reads as "no release" (#841).
    expect(harnessMetaLine(undefined)).toBeNull();
  });
});
