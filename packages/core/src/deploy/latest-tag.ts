// Parses the Rich table `apm view <owner>/<repo> versions` prints — it has no
// --json (apm-behavior.md § Latest tag). Semver-sorted here because apm's row
// order is not contractual, and v0.10.0 must beat v0.9.0.

const tagRowPattern = /│\s*(v\d+\.\d+\.\d+)\s*│\s*tag\s*│/;

type SemverParts = [major: number, minor: number, patch: number];

const toParts = (tag: string): SemverParts => {
  // The pattern guarantees three numeric parts; the defaults only satisfy
  // noUncheckedIndexedAccess.
  const [major = 0, minor = 0, patch = 0] = tag.slice(1).split(".").map(Number);
  return [major, minor, patch];
};

const compareParts = (a: SemverParts, b: SemverParts): number =>
  a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

export const resolveLatestTagFromVersionsTable = (
  output: string,
): string | null => {
  const tags = output
    .split("\n")
    .map((line) => tagRowPattern.exec(line)?.[1])
    .filter((tag): tag is string => tag !== undefined);

  if (tags.length === 0) {
    return null;
  }
  return tags.reduce((latest, tag) =>
    compareParts(toParts(tag), toParts(latest)) > 0 ? tag : latest,
  );
};
