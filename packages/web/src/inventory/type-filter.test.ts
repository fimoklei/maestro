import { describe, expect, it } from "vitest";
import { filterByName, typeOptions } from "./type-filter";
import type { Primitive } from "./use-inventory";

describe("typeOptions", () => {
  it("returns one option per type present in the data", () => {
    const options = typeOptions([{ type: "skill" }, { type: "skill" }]);

    expect(options).toEqual([{ value: "skill", label: "Skills" }]);
  });

  it("collapses repeated types into one option", () => {
    const options = typeOptions([
      { type: "skill" },
      { type: "hook" },
      { type: "skill" },
    ]);

    expect(options.map((s) => s.value)).toEqual(["skill", "hook"]);
  });

  it("orders options canonically, not by insertion order", () => {
    const options = typeOptions([
      { type: "bundle" },
      { type: "skill" },
      { type: "mcp" },
    ]);

    expect(options.map((s) => s.value)).toEqual(["skill", "mcp", "bundle"]);
  });

  it("labels each type as its plural control label", () => {
    const options = typeOptions([
      { type: "skill" },
      { type: "hook" },
      { type: "mcp" },
      { type: "bundle" },
    ]);

    expect(options.map((s) => s.label)).toEqual([
      "Skills",
      "Hooks",
      "MCP servers",
      "Bundles",
    ]);
  });

  it("yields no options for empty data", () => {
    expect(typeOptions([])).toEqual([]);
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
