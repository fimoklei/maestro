// Pure search-and-sort model for the inventory table (#287). Kept out of the
// component so the narrowing and ordering are testable predicates, not inline
// JSX logic (see the issue's acceptance criteria and frontend.md).
import type { Primitive } from "./use-inventory";

export type SortColumn = "type" | "name" | "description";

export type SortState = { column: SortColumn; direction: "asc" | "desc" };

// Narrows to primitives whose name contains the query, case-insensitively. An
// empty (or whitespace-only) query is "no filter" and returns every primitive.
// Name only: the search box sits over the name column, so matching descriptions
// would surprise the user with rows whose visible name looks unrelated.
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

// Returns a new array ordered by the sort column; never mutates the input, so
// the loaded inventory stays in its original order for an unsorted view.
export function sortPrimitives(
  primitives: Primitive[],
  sort: SortState,
): Primitive[] {
  const factor = sort.direction === "asc" ? 1 : -1;
  return [...primitives].sort(
    (a, b) => factor * a[sort.column].localeCompare(b[sort.column]),
  );
}

// The sort state after a header click. A fresh column starts ascending; the
// active column toggles ascending ↔ descending, so a second click reverses it.
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
