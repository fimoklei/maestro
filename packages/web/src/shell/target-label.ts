// A compact display label for a local target path. Deep repo paths share a long
// common prefix ("/Users/<me>/Projects/…"), so left-anchored truncation drops
// the tail — the only part that tells two clones apart (issue #211). Keep the
// tail instead: the shortest suffix that is still unique among the sibling
// targets, never fewer than two segments (parent + basename), prefixed with an
// ellipsis when anything was dropped. Passing no siblings yields the plain
// two-segment tail — right for the single-source header and connect screen,
// where there is nothing to disambiguate against. The full path always stays
// available on hover via a native title tooltip at each call site.
const MIN_SEGMENTS = 2;

export function targetLabel(
  path: string,
  siblings: readonly string[] = [],
): string {
  const segments = path.split("/").filter(Boolean);
  if (segments.length <= MIN_SEGMENTS) return path;

  const others = siblings
    .filter((sibling) => sibling !== path)
    .map((sibling) => sibling.split("/").filter(Boolean));

  // Grow the tail one segment at a time until no sibling ends with the same
  // suffix. The first unique suffix is the shortest label that still tells this
  // target apart from the others.
  for (let take = MIN_SEGMENTS; take < segments.length; take++) {
    const suffix = segments.slice(-take);
    if (!others.some((other) => endsWith(other, suffix))) {
      return `…/${suffix.join("/")}`;
    }
  }

  // A sibling shares this path's whole tail (a shorter clone nested inside a
  // deeper one). No proper suffix is unique, so the full path — always unique
  // among distinct registered targets — stands.
  return path;
}

// Whether `segments` ends with `suffix`, segment for segment.
function endsWith(segments: string[], suffix: string[]): boolean {
  if (suffix.length > segments.length) return false;
  const tail = segments.slice(-suffix.length);
  return suffix.every((segment, index) => segment === tail[index]);
}
