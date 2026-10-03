import { describe, expect, it } from "vitest";
import { deriveTypeSegments, filterByName } from "./type-filter";
import type { Primitive } from "./use-inventory";

describe("deriveTypeSegments", () => {
  it("returns one segment per type present in the data", () => {
    const segments = deriveTypeSegments([{ type: "skill" }, { type: "skill" }]);

    expect(segments).toEqual([{ value: "skill", label: "Skills" }]);
  });

  it("collapses repeated types into one segment", () => {
    const segments = deriveTypeSegments([
      { type: "skill" },
      { type: "hook" },
      { type: "skill" },
    ]);

    expect(segments.map((s) => s.value)).toEqual(["skill", "hook"]);
  });

  it("orders segments canonically, not by insertion order", () => {
    const segments = deriveTypeSegments([
      { type: "bundle" },
      { type: "skill" },
      { type: "mcp" },
    ]);

    expect(segments.map((s) => s.value)).toEqual(["skill", "mcp", "bundle"]);
  });

  it("labels each type as its plural control label", () => {
    const segments = deriveTypeSegments([
      { type: "skill" },
      { type: "hook" },
      { type: "mcp" },
      { type: "bundle" },
    ]);

    expect(segments.map((s) => s.label)).toEqual([
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
