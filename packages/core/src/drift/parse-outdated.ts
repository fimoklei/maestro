// Turns the human Rich table that `apm outdated` prints (it has no --json) into
// the set of skills behind the latest central tag. Identity is the skill name —
// the last path segment of the Package cell — so a deployed skill can be matched
// without keying on the full owner/repo/skills/<name> string (which Rich
// truncates at narrow widths).
//
// The result is deliberately a discriminated union, not a bare array: apm prints
// one of three recognised shapes, and anything else (a format change, an error
// banner) must read as "could not interpret" — never as an empty behind set.
// An empty set that actually means "I didn't understand the output" would render
// as up-to-date, the false reassurance J04 exists to prevent. So when no row
// parses and apm did not print one of its two empty-state banners (a format
// change, an error message), we fail instead of reporting an empty behind set.

export type OutdatedResult = { ok: true; behind: string[] } | { ok: false };

// apm's terminal banners for the two empty outcomes — its own statement that
// there is genuinely nothing behind. Their absence (with no parsed rows either)
// means the output is unrecognised, not empty.
const UP_TO_DATE = /All dependencies are up-to-date/;
const NO_REMOTE = /No remote dependencies to check/;

// A data row: five │-separated cells. We split on the light vertical bar, which
// only data rows use — the header and separators use heavy box-drawing glyphs.
const cellsOf = (line: string): string[] =>
  line
    .split("│")
    .map((cell) => cell.trim())
    .filter((cell) => cell.length > 0);

const lastSegment = (packageCell: string): string =>
  packageCell.split("/").at(-1) ?? packageCell;

const behindFromRows = (output: string): string[] => {
  const behind: string[] = [];
  for (const line of output.split("\n")) {
    const cells = cellsOf(line);
    if (cells.length !== 5) {
      continue;
    }
    const [packageCell, , , status] = cells;
    if (status !== "outdated" || packageCell === undefined) {
      continue;
    }
    behind.push(lastSegment(packageCell));
  }
  return behind;
};

export const parseOutdated = (output: string): OutdatedResult => {
  if (UP_TO_DATE.test(output) || NO_REMOTE.test(output)) {
    return { ok: true, behind: [] };
  }

  const behind = behindFromRows(output);
  if (behind.length > 0) {
    return { ok: true, behind };
  }

  // No rows parsed and no "up-to-date"/"no-remote" banner. If apm's summary
  // still claims outdated deps, the table shape changed under us — fail rather
  // than report a false up-to-date. Any other unrecognised output fails too.
  return { ok: false };
};
