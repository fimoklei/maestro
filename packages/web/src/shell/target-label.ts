// Shortest unique suffix, min 2 segments: deep repo paths share a long prefix,
// so left-anchored truncation would drop the part that tells clones apart (#211).
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

  for (let take = MIN_SEGMENTS; take < segments.length; take++) {
    const suffix = segments.slice(-take);
    if (!others.some((other) => endsWith(other, suffix))) {
      return `…/${suffix.join("/")}`;
    }
  }

  // No proper suffix is unique (a shorter clone nested inside a deeper one).
  return path;
}

function endsWith(segments: string[], suffix: string[]): boolean {
  if (suffix.length > segments.length) return false;
  const tail = segments.slice(-suffix.length);
  return suffix.every((segment, index) => segment === tail[index]);
}
