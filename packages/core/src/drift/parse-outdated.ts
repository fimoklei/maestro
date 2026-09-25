// Parses the Rich table `apm outdated` prints; it has no --json. Identity is
// the last path segment of the Package cell: Rich truncates the full ref.

import { isValidSkillSlug } from "../deploy/package-ref";

export type VersionDrift = { name: string; current: string; latest: string };

// Never a bare array: an empty set for unparsed output would read as up to date.
// "unverified" is apm reached but could not resolve; absent is a real failure.
export type OutdatedResult =
  | { ok: true; behind: VersionDrift[] }
  | { ok: false; reason?: "unverified" };

const UP_TO_DATE = /All dependencies are up-to-date/;
const NO_REMOTE = /No remote dependencies to check/;

const COULD_NOT_CHECK = /could not be checked/;
const UNCHECKABLE_STATUS = "unknown";

// These cells reach the browser, so their shape is checked here: an allowlist
// short enough and narrow enough to refuse a path, URL or token. Not pinned to
// `vX.Y.Z`: apm legitimately writes a bare word like `unknown`.
const VERSION_CELL = /^[0-9A-Za-z][0-9A-Za-z.-]{0,31}$/;

// Status is read by position: the other columns hold unconstrained data.
const [PACKAGE, CURRENT, LATEST, STATUS] = [0, 1, 2, 3];
const COLUMN_COUNT = 5;

// Only data rows use the light bar. Empty cells must keep their place.
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

// Null when an outdated row fails the shape check. Refuse the whole read:
// skipping the row would show that skill as up to date.
const behindFromRows = (output: string): VersionDrift[] | null => {
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
    const name = lastSegment(packageCell);
    if (
      !isValidSkillSlug(name) ||
      !VERSION_CELL.test(current) ||
      !VERSION_CELL.test(latest)
    ) {
      return null;
    }
    behind.push({ name, current, latest });
  }
  return behind;
};

export const parseOutdated = (output: string): OutdatedResult => {
  if (UP_TO_DATE.test(output) || NO_REMOTE.test(output)) {
    return { ok: true, behind: [] };
  }

  // Before row parsing, or an uncheckable dep beside an outdated one would
  // read as up to date.
  if (hasUncheckable(output)) {
    return { ok: false, reason: "unverified" };
  }

  const behind = behindFromRows(output);
  if (behind === null) {
    return { ok: false };
  }
  if (behind.length > 0) {
    return { ok: true, behind };
  }

  // No rows and no banner: the table shape changed. Fail closed.
  return { ok: false };
};
