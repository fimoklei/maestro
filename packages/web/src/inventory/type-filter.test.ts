import { describe, expect, it } from "vitest";
import { deriveTypeSegments, filterByName, filterByType } from "./type-filter";
import type { Primitive } from "./use-inventory";

describe("deriveTypeSegments", () => {
  it("returns all plus one segment per type present in the data", () => {
    const segments = deriveTypeSegments([{ type: "skill" }, { type: "skill" }]);

    expect(segments).toEqual([
      { value: "all", label: "All" },
      { value: "skill", label: "Skills" },
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
      "All",
      "Skills",
      "Hooks",
      "MCP servers",
      "Bundles",
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

const primitives: Primitive[] = [
  { type: "skill", name: "tdd", description: "Test-driven development." },
  { type: "skill", name: "caveman", description: "Terse mode." },
  { type: "skill", name: "Research", description: "Investigate a question." },
];

describe("filterByName", () => {
  it("returns every primitive for an empty query", () => {
    expect(filterByName(primitives, "")).toEqual(primitives);
  });

  it("keeps only primitives whose name contains the query", () => {
    expect(filterByName(primitives, "cave")).toEqual([primitives[1]]);
  });

  it("matches case-insensitively", () => {
    expect(filterByName(primitives, "RESEARCH")).toEqual([primitives[2]]);
  });

  it("ignores surrounding whitespace in the query", () => {
    expect(filterByName(primitives, "  tdd  ")).toEqual([primitives[0]]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterByName(primitives, "zzz")).toEqual([]);
  });

  it("matches on name only, never description", () => {
    expect(filterByName(primitives, "development")).toEqual([]);
  });
});
