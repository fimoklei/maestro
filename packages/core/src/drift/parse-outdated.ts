// Turns the human Rich table that `apm outdated` prints (it has no --json) into
// the set of skills behind the latest central tag. Identity is the skill name —
// the last path segment of the Package cell — so a deployed skill can be matched
// without keying on the full owner/repo/skills/<name> string (which Rich
// truncates at narrow widths). Every claim here about what apm prints is
// recorded, with its observed apm version, in .claude/rules/apm-driver.md —
// re-verify there on an apm upgrade.
//
// The result is deliberately a discriminated union, not a bare array: an empty
// set that actually means "I didn't understand the output" would render as
// up-to-date, the false reassurance J04 exists to prevent. So a recognised
// empty-state banner reads as up-to-date; a dep apm could not check reads as
// unverified (reason below); anything else unrecognised fails — never an empty
// behind set.

// One behind skill as the deployed -> latest version pair apm already prints on
// the row (Current / Latest cells). Identity is still the skill name; the pair
// is kept rather than reduced to a binary flag (ADR-0007). The behind/up-to-date
// judgment stays derivable downstream (latest !== current).
export type VersionDrift = { name: string; current: string; latest: string };

// A check that produced no behind set carries why. `reason: "unverified"` means
// apm reached the tool but could not resolve a dep against its remote (no
// auth/network) — a reachability failure, distinct from an absent `reason` (a
// genuine failure: CLI missing, non-zero exit, unrecognised output). The web
// shows "unverified" as its own state so an uncheckable dep never reads as
// up-to-date (J04) and the cause points at auth/network, not a bare "unknown".
export type OutdatedResult =
  | { ok: true; behind: VersionDrift[] }
  | { ok: false; reason?: "unverified" };

// apm's terminal banners for the two empty outcomes — its own statement that
// there is genuinely nothing behind. Their absence (with no parsed rows either)
// means the output is unrecognised, not empty (apm-driver.md).
const UP_TO_DATE = /All dependencies are up-to-date/;
const NO_REMOTE = /No remote dependencies to check/;

// apm's summary and per-dep status when it could not resolve a tag-pinned dep
// against its remote: it prints a row with Status "unknown" (Latest "-") and
// this banner, exit 0 (observed on apm 0.26.0, 2026-07-20; fixture
// apm-outdated-could-not-check.txt). Either signal marks the run unverified.
const COULD_NOT_CHECK = /could not be checked/;
const UNCHECKABLE_STATUS = "unknown";

// The table's five columns, in apm's order. Only Status says what apm concluded
// about a dep; the other four are data whose content apm does not constrain, so
// every judgment below reads Status by position and never scans the row for a
// bare token (fixture apm-outdated-could-not-check.txt).
const [PACKAGE, CURRENT, LATEST, STATUS] = [0, 1, 2, 3];
const COLUMN_COUNT = 5;

// The cells of one data row, empties included, or null when the line is not a
// data row. We split on the light vertical bar, which only data rows use — the
// header and separators use heavy box-drawing glyphs (apm-driver.md). The split
// yields the text outside the outer bars as a first and last element; dropping
// those leaves exactly the columns, so an empty cell still holds its place and
// Status keeps its index. The uncheckable row relies on that: its Source cell is
// empty (apm-driver.md).
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

// True when apm flagged any dep as uncheckable — its "could not be checked"
// summary, or a row whose Status column reads "unknown".
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

  // Precedes row parsing: a mix of one outdated and one uncheckable dep must not
  // report ok+behind and silently drop the uncheckable one to a false up-to-date.
  if (hasUncheckable(output)) {
    return { ok: false, reason: "unverified" };
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
