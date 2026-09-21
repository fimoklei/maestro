import { describe, expect, it } from "vitest";
import { harnessMetaLine } from "./use-harness-summary";

// The release and the skill count come from their own read, so either can be
// missing while the other is known. Undefined is "not read yet"; null is a
// read that found no release.
describe("harnessMetaLine", () => {
  it("names the release and the skill count together", () => {
    expect(harnessMetaLine("v1.4.0", 24)).toBe("v1.4.0 · 24 skills");
  });

  it("counts one skill in the singular", () => {
    expect(harnessMetaLine("v1.4.0", 1)).toBe("v1.4.0 · 1 skill");
  });

  it("states a Harness with no release yet, rather than leaving it blank", () => {
    expect(harnessMetaLine(null, 24)).toBe("No release · 24 skills");
  });

  it("states the count alone while the release is unread", () => {
    // A number nothing confirmed is never stated (#841), so an unread release
    // drops out of the line instead of reading as "no release".
    expect(harnessMetaLine(undefined, 24)).toBe("24 skills");
  });

  it("states the release alone while the count is unread", () => {
    expect(harnessMetaLine("v1.4.0", undefined)).toBe("v1.4.0");
  });

  it("states nothing at all while neither read has landed", () => {
    expect(harnessMetaLine(undefined, undefined)).toBeNull();
  });

  it("states a released Harness holding no skills as zero, not as unread", () => {
    expect(harnessMetaLine("v1.4.0", 0)).toBe("v1.4.0 · 0 skills");
  });
});
