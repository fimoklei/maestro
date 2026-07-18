// Resolves the latest deployable tag from the human Rich table that
// `apm view <owner>/<repo> versions` prints (it has no --json). Only rows of
// type "tag" with a strict vX.Y.Z name count; branches and loose tags are
// ignored. We semver-sort ourselves because apm's row order is not contractual
// (v0.10.0 must beat v0.9.0, which a lexicographic sort gets wrong). The
// observed shape of that table, with its apm version, lives in
// .claude/rules/apm-driver.md — re-verify there on an apm upgrade.

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
