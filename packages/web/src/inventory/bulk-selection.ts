// Held by name, independent of the narrowed view, so filtering never drops a
// staged skill (#291).

// Returns a new set — never mutates the input, so React sees a fresh reference.
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

export function setStagedMany(
  staged: ReadonlySet<string>,
  names: Iterable<string>,
  stage: boolean,
): Set<string> {
  const next = new Set(staged);
  for (const name of names) {
    if (stage) next.add(name);
    else next.delete(name);
  }
  return next;
}

// Surfaced so a bulk action's reach is never larger than what's visible (#291).
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
