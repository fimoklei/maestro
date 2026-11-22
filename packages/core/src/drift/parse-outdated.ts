import { isValidSkillSlug } from "../deploy/package-ref";

export type VersionDrift = { name: string; current: string; latest: string };

export type OutdatedResult =
  | { ok: true; behind: VersionDrift[] }
  | { ok: false; reason?: "unverified" | "timed-out" };

const UP_TO_DATE = /All dependencies are up-to-date/;
const NO_REMOTE = /No remote dependencies to check/;

const COULD_NOT_CHECK = /could not be checked/;
const UNCHECKABLE_STATUS = "unknown";

const VERSION_CELL = /^[0-9A-Za-z][0-9A-Za-z.-]{0,31}$/;

const [PACKAGE, CURRENT, LATEST, STATUS] = [0, 1, 2, 3];
const COLUMN_COUNT = 5;

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

export const lastSegment = (packageCell: string): string =>
  packageCell.split("/").at(-1) ?? packageCell;

const hasUncheckable = (output: string): boolean =>
  COULD_NOT_CHECK.test(output) ||
  rowsOf(output).some((cells) => cells[STATUS] === UNCHECKABLE_STATUS);

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

  return { ok: false };
};
