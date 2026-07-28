// Parses the Rich table `apm outdated` prints — it has no --json
// (apm-behavior.md § Drift). Identity is the last path segment of the Package
// cell, because Rich truncates the full ref at narrow widths.

// A pair, not a binary flag: behind/up-to-date stays derivable (ADR-0007).
export type VersionDrift = { name: string; current: string; latest: string };

// A union, never a bare array: an empty set meaning "I did not understand the
// output" would render as up-to-date, the false reassurance J04 forbids.
// "unverified" is apm reached but could not resolve; absent is a real failure.
export type OutdatedResult =
  | { ok: true; behind: VersionDrift[] }
  | { ok: false; reason?: "unverified" };

// apm's own statement that nothing is behind. Absent, with no rows parsed, the
// output is unrecognised — not empty (apm-behavior.md § Drift).
const UP_TO_DATE = /All dependencies are up-to-date/;
const NO_REMOTE = /No remote dependencies to check/;

// Either signal marks the run unverified (fixture
// apm-outdated-could-not-check.txt).
const COULD_NOT_CHECK = /could not be checked/;
const UNCHECKABLE_STATUS = "unknown";

// Status is read by position, never by scanning the row for a bare token: the
// other four columns hold data apm does not constrain.
const [PACKAGE, CURRENT, LATEST, STATUS] = [0, 1, 2, 3];
const COLUMN_COUNT = 5;

// Splits on the light vertical bar, which only data rows use — header and
// separators use heavy glyphs. Empty cells keep their place, which the
// uncheckable row (empty Source cell) relies on (apm-behavior.md § Drift).
const cellsOf = (line: string): string[] | null => {
  if (!line.includes("│")) {
    return null;
  }
  const cells = line
    .split("│")
    .slice(1, -1)
    .map((cell) => cell.trim());
  return cells.length === COLUMN_COUNT ? cells : null;
};

const rowsOf = (output: string): string[][] =>
  output
    .split("\n")
    .map(cellsOf)
    .filter((cells) => cells !== null);

const lastSegment = (packageCell: string): string =>
  packageCell.split("/").at(-1) ?? packageCell;

const hasUncheckable = (output: string): boolean =>
  COULD_NOT_CHECK.test(output) ||
  rowsOf(output).some((cells) => cells[STATUS] === UNCHECKABLE_STATUS);

const behindFromRows = (output: string): VersionDrift[] => {
  const behind: VersionDrift[] = [];
  for (const cells of rowsOf(output)) {
    const packageCell = cells[PACKAGE];
    const current = cells[CURRENT];
    const latest = cells[LATEST];
    if (
      cells[STATUS] !== "outdated" ||
      packageCell === undefined ||
      current === undefined ||
      latest === undefined
    ) {
      continue;
    }
    behind.push({ name: lastSegment(packageCell), current, latest });
  }
  return behind;
};

export const parseOutdated = (output: string): OutdatedResult => {
  if (UP_TO_DATE.test(output) || NO_REMOTE.test(output)) {
    return { ok: true, behind: [] };
  }

  // Before row parsing: one outdated plus one uncheckable dep must not report
  // ok+behind and drop the uncheckable one to a false up-to-date (J04).
  if (hasUncheckable(output)) {
    return { ok: false, reason: "unverified" };
  }

  const behind = behindFromRows(output);
  if (behind.length > 0) {
    return { ok: true, behind };
  }

  // No rows and no banner: the table shape changed under us. Fail rather than
  // report a false up-to-date.
  return { ok: false };
};
