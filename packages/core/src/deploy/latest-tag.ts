// Parses the Rich table `apm view <owner>/<repo> versions` prints — it has no
// --json (apm-behavior.md § Latest tag). Semver-sorted here because apm's row
// order is not contractual, and v0.10.0 must beat v0.9.0.

const tagRowPattern = /│\s*(v\d+\.\d+\.\d+)\s*│\s*tag\s*│/;

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
  // Numeric collation reads each digit run as a number, so v0.10.0 beats
  // v0.9.0 where a plain string compare would not.
  return tags.reduce((latest, tag) =>
    tag.localeCompare(latest, "en", { numeric: true }) > 0 ? tag : latest,
  );
};
