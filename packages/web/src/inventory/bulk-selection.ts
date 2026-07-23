// Tracks which skills are ticked for a bulk action, apart from what the table
// shows.
//
// Staged names are held by name, independent of the narrowed view, so filtering
// or searching never drops a staged skill (#291). Kept out of the component so
// the toggle and hidden-count stay testable predicates (frontend.md).

// The staged set after toggling one name: adds it when absent, removes it when
// present. Returns a new set — the input is never mutated, so React sees a fresh
// reference and staging one skill can never disturb another's state.
export function toggleStaged(
  staged: ReadonlySet<string>,
  name: string,
): Set<string> {
  const next = new Set(staged);
  if (next.has(name)) {
    next.delete(name);
  } else {
    next.add(name);
  }
  return next;
}

// How many staged skills the current filter/search hides — staged names not in
// the visible set. The bulk bar surfaces this so a bulk action's reach is never
// larger than what the user can see (#291).
export function hiddenStagedCount(
  staged: ReadonlySet<string>,
  visibleNames: Iterable<string>,
): number {
  const visible = new Set(visibleNames);
  let hidden = 0;
  for (const name of staged) {
    if (!visible.has(name)) {
      hidden += 1;
    }
  }
  return hidden;
}
