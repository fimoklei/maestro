import type { InventorySkill } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { filterByName } from "./type-filter";

const primitives: InventorySkill[] = [
  {
    type: "skill",
    name: "tdd",
    path: ".apm/skills/tdd",
    description: "Test-driven development.",
  },
  {
    type: "skill",
    name: "caveman",
    path: ".apm/skills/caveman",
    description: "Terse mode.",
  },
  {
    type: "skill",
    name: "Research",
    path: ".apm/skills/Research",
    description: "Investigate a question.",
  },
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
