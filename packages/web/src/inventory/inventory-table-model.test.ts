import { describe, expect, it } from "vitest";
import {
  filterByName,
  nextSort,
  type SortState,
  sortPrimitives,
} from "./inventory-table-model";
import type { Primitive } from "./use-inventory";

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

describe("sortPrimitives", () => {
  it("orders ascending by name via locale compare", () => {
    const sorted = sortPrimitives(primitives, {
      column: "name",
      direction: "asc",
    });
    expect(sorted.map((p) => p.name)).toEqual(["caveman", "Research", "tdd"]);
  });

  it("orders descending by name", () => {
    const sorted = sortPrimitives(primitives, {
      column: "name",
      direction: "desc",
    });
    expect(sorted.map((p) => p.name)).toEqual(["tdd", "Research", "caveman"]);
  });

  it("sorts by the description column", () => {
    const sorted = sortPrimitives(primitives, {
      column: "description",
      direction: "asc",
    });
    expect(sorted.map((p) => p.name)).toEqual(["Research", "caveman", "tdd"]);
  });

  it("returns a new array and does not mutate the input", () => {
    const input: Primitive[] = [...primitives];
    const snapshot = [...input];
    const sorted = sortPrimitives(input, { column: "name", direction: "asc" });
    expect(sorted).not.toBe(input);
    expect(input).toEqual(snapshot);
  });
});

describe("nextSort", () => {
  it("starts a new column ascending when nothing is sorted", () => {
    expect(nextSort(null, "name")).toEqual({
      column: "name",
      direction: "asc",
    });
  });

  it("starts a different column ascending", () => {
    const current: SortState = { column: "name", direction: "desc" };
    expect(nextSort(current, "type")).toEqual({
      column: "type",
      direction: "asc",
    });
  });

  it("flips the same column from ascending to descending", () => {
    const current: SortState = { column: "name", direction: "asc" };
    expect(nextSort(current, "name")).toEqual({
      column: "name",
      direction: "desc",
    });
  });

  it("flips the same column from descending back to ascending", () => {
    const current: SortState = { column: "name", direction: "desc" };
    expect(nextSort(current, "name")).toEqual({
      column: "name",
      direction: "asc",
    });
  });
});
