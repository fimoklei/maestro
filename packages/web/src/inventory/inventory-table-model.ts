// Pure search-and-sort model for the inventory table (#287).
import type { Primitive } from "./use-inventory";

export type SortColumn = "type" | "name" | "description";

export type SortState = { column: SortColumn; direction: "asc" | "desc" };

// Name only, case-insensitive — matching descriptions would surprise the
// user with rows whose visible name looks unrelated.
export function filterByName(
  primitives: Primitive[],
  query: string,
): Primitive[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return primitives;
  }
  return primitives.filter((p) => p.name.toLowerCase().includes(needle));
}

// Never mutates the input, so the loaded inventory keeps its original order.
export function sortPrimitives(
  primitives: Primitive[],
  sort: SortState,
): Primitive[] {
  const factor = sort.direction === "asc" ? 1 : -1;
  return [...primitives].sort(
    (a, b) => factor * a[sort.column].localeCompare(b[sort.column]),
  );
}

// A fresh column starts ascending; the active column toggles on a second click.
export function nextSort(
  current: SortState | null,
  column: SortColumn,
): SortState {
  if (current === null || current.column !== column) {
    return { column, direction: "asc" };
  }
  return {
    column,
    direction: current.direction === "asc" ? "desc" : "asc",
  };
}
