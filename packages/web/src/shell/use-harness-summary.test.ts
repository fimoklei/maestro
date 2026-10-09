import { describe, expect, it } from "vitest";
import { machineValues } from "../test-utils";
import { plainText } from "../ui/phrase";
import { harnessMetaLine } from "./use-harness-summary";

const line = (...args: Parameters<typeof harnessMetaLine>) => {
  const meta = harnessMetaLine(...args);
  return meta === null ? null : plainText(meta);
};

describe("harnessMetaLine", () => {
  it("names the release and the skill count together", () => {
    expect(line("v1.4.0", 24)).toBe("v1.4.0 · 24 skills");
  });

  it("sets only the release apart as a machine value", () => {
    expect(machineValues(harnessMetaLine("v1.4.0", 24) ?? "")).toEqual([
      "v1.4.0",
    ]);
    expect(machineValues(harnessMetaLine(null, 24) ?? "")).toEqual([]);
  });

  it("counts one skill in the singular", () => {
    expect(line("v1.4.0", 1)).toBe("v1.4.0 · 1 skill");
  });

  it("states a Harness with no release yet, rather than leaving it blank", () => {
    expect(line(null, 24)).toBe("Not released yet · 24 skills");
  });

  it("states the count alone while the release is unread", () => {
    // An unread release drops out of the line, never reads as "no release" (#841).
    expect(line(undefined, 24)).toBe("24 skills");
  });

  it("states the release alone while the count is unread", () => {
    expect(line("v1.4.0", undefined)).toBe("v1.4.0");
  });

  it("states nothing at all while neither read has landed", () => {
    expect(harnessMetaLine(undefined, undefined)).toBeNull();
  });

  it("states a released Harness holding no skills as zero, not as unread", () => {
    expect(line("v1.4.0", 0)).toBe("v1.4.0 · 0 skills");
  });
});
