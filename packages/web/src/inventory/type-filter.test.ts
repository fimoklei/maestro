import { describe, expect, it } from "vitest";
import { deriveTypeSegments, filterByType } from "./type-filter";

describe("deriveTypeSegments", () => {
  it("returns all plus one segment per type present in the data", () => {
    const segments = deriveTypeSegments([{ type: "skill" }, { type: "skill" }]);

    expect(segments).toEqual([
      { value: "all", label: "all" },
      { value: "skill", label: "skills" },
    ]);
  });

  it("collapses repeated types into one segment", () => {
    const segments = deriveTypeSegments([
      { type: "skill" },
      { type: "hook" },
      { type: "skill" },
    ]);

    expect(segments.map((s) => s.value)).toEqual(["all", "skill", "hook"]);
  });

  it("orders segments canonically, not by insertion order", () => {
    const segments = deriveTypeSegments([
      { type: "bundle" },
      { type: "skill" },
      { type: "mcp" },
    ]);

    expect(segments.map((s) => s.value)).toEqual([
      "all",
      "skill",
      "mcp",
      "bundle",
    ]);
  });

  it("labels each type as its plural control label", () => {
    const segments = deriveTypeSegments([
      { type: "skill" },
      { type: "hook" },
      { type: "mcp" },
      { type: "bundle" },
    ]);

    expect(segments.map((s) => s.label)).toEqual([
      "all",
      "skills",
      "hooks",
      "mcp servers",
      "bundles",
    ]);
  });

  it("yields no segments for empty data", () => {
    expect(deriveTypeSegments([])).toEqual([]);
  });
});

describe("filterByType", () => {
  const items = [
    { type: "skill", name: "tdd" },
    { type: "hook", name: "pre-commit" },
    { type: "skill", name: "caveman" },
  ] as const;

  it("narrows to the selected type", () => {
    expect(filterByType(items, "skill")).toEqual([
      { type: "skill", name: "tdd" },
      { type: "skill", name: "caveman" },
    ]);
  });

  it("shows everything for all", () => {
    expect(filterByType(items, "all")).toEqual(items);
  });
});
