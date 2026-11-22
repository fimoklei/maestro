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
  return tags.reduce((latest, tag) =>
    tag.localeCompare(latest, "en", { numeric: true }) > 0 ? tag : latest,
  );
};
