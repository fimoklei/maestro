// What an Update did, as a Report. A repository states its failures per skill,
// per tool only where the tools disagree; Global states one fact per Global
// folder.
import type {
  FolderOutcome,
  FolderOutcomes,
  SkillOutcome,
  UpdateOutcomeRow,
  UpdateSkillState,
} from "@maestro/core";
import { HttpError } from "../api/http";
import type { FoldLine } from "../ui/fold-list";
import type { ReportGroup } from "../ui/report";
import { isSupportedTool } from "./tool-presentation";
import {
  consentRowName,
  outcomeDetail,
  outcomeHeading,
  type UnlandedState,
  UPDATE_INCOMPLETE,
} from "./update-target-copy";
import {
  folderLines,
  type GlobalFolderRef,
  unconfirmedLine,
  updatedToLine,
} from "./written-to-copy";

/** What the dialog shows once an update ran. */
export type UpdateRunView =
  | { kind: "skills"; rows: readonly UpdateOutcomeRow[] }
  | { kind: "folders"; folders: FolderOutcomes }
  // Global, where nothing read the folders back.
  | { kind: "unknown" };

const STATES: readonly UpdateSkillState[] = [
  "updated",
  "removed",
  "not-updated",
  "missing",
  "not-removed",
  "unknown",
];

type Fields = { [key: string]: unknown };

const isFields = (value: unknown): value is Fields =>
  typeof value === "object" && value !== null;

const isOneOf = <T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T => allowed.some((each) => each === value);

const bodyOf = (error: unknown): Fields | null =>
  error instanceof HttpError && isFields(error.body) ? error.body : null;

function isOutcomeRow(entry: unknown): entry is UpdateOutcomeRow {
  return (
    isFields(entry) &&
    typeof entry.name === "string" &&
    (entry.tool === null || isSupportedTool(entry.tool)) &&
    isOneOf(entry.state, STATES)
  );
}

function isSkillOutcome(skill: unknown): skill is SkillOutcome {
  if (!isFields(skill) || typeof skill.name !== "string") return false;
  return skill.outcome === "not-updated"
    ? skill.stillAt === null || typeof skill.stillAt === "string"
    : isOneOf(skill.outcome, ["written", "missing", "not-confirmed"]);
}

function isFolderOutcome(folder: unknown): folder is FolderOutcome {
  return (
    isFields(folder) &&
    typeof folder.path === "string" &&
    isSupportedTool(folder.tool) &&
    typeof folder.detected === "boolean" &&
    Array.isArray(folder.skills) &&
    folder.skills.every(isSkillOutcome)
  );
}

// A report this build cannot read is dropped whole: a row built on a guess
// states an outcome the server never proved.
export function updateOutcomeRows(error: unknown): UpdateOutcomeRow[] | null {
  const outcome = bodyOf(error)?.outcome;
  if (!Array.isArray(outcome) || !outcome.every(isOutcomeRow)) {
    return null;
  }
  return outcome.map(({ name, tool, state }) => ({ name, tool, state }));
}

/** A failed Global update's folders, read back where apm ran; null otherwise. */
export function updateFolders(error: unknown): FolderOutcomes | null {
  const folders = bodyOf(error)?.folders;
  return isFields(folders) &&
    typeof folders.release === "string" &&
    Array.isArray(folders.folders) &&
    folders.folders.every(isFolderOutcome)
    ? { release: folders.release, folders: folders.folders }
    : null;
}

export function updateOutcomeReport(input: {
  rows: readonly UpdateOutcomeRow[];
  releases: { from: string; to: string };
  /** Retry update is on screen, so a failure names it as the next step. */
  retry: boolean;
}): { heading: string; groups: ReportGroup[] } {
  const { releases, retry } = input;
  const rows = foldAgreeingTools(input.rows);
  const inState = <S extends UpdateSkillState>(...states: S[]) =>
    rows.filter((row): row is UpdateOutcomeRow & { state: S } =>
      (states as UpdateSkillState[]).includes(row.state),
    );
  const detailed = (row: UpdateOutcomeRow & { state: UnlandedState }) => ({
    name: consentRowName(row),
    detail: outcomeDetail(row.state, releases, retry),
  });

  const failed = inState("not-updated", "missing", "not-removed").map(detailed);
  const unknown = inState("unknown").map(detailed);
  return {
    heading: outcomeHeading(
      releases.to,
      failed.length > 0
        ? "failed"
        : unknown.length > 0
          ? "unconfirmed"
          : "landed",
    ),
    groups: [
      { tone: "failed", label: "Failed", rows: failed },
      { tone: "attention", label: "Attention", rows: unknown },
    ],
  };
}

/** Global's Report frame: one `Written to` line per Global folder. */
export function updateFoldersReport(input: {
  folders: FolderOutcomes;
  /** The update did not finish: Retry update is in the footer, and a deviating folder names it. */
  retry: boolean;
}): { heading: string; lines: FoldLine[] } {
  const { folders, retry } = input;
  const outcomes = folders.folders.flatMap((folder) =>
    folder.skills.map((skill) => skill.outcome),
  );
  const verdict = outcomes.some(
    (outcome) => outcome === "missing" || outcome === "not-updated",
  )
    ? "failed"
    : outcomes.includes("not-confirmed")
      ? "unconfirmed"
      : "landed";
  return {
    // Every folder can read at the release while the record still disagrees.
    heading:
      retry && verdict === "landed"
        ? UPDATE_INCOMPLETE
        : outcomeHeading(folders.release, verdict),
    lines: folderLines(folders.folders, (folder) =>
      updatedToLine(folder, { release: folders.release, retry }),
    ),
  };
}

/** Every folder Global writes reads Not confirmed: nothing read them back. */
export const unconfirmedLines = (
  folders: readonly GlobalFolderRef[],
): FoldLine[] => folderLines(folders, () => unconfirmedLine);

function foldAgreeingTools(
  rows: readonly UpdateOutcomeRow[],
): UpdateOutcomeRow[] {
  const byName = new Map<string, UpdateOutcomeRow[]>();
  for (const row of rows) {
    byName.set(row.name, [...(byName.get(row.name) ?? []), row]);
  }
  return [...byName.values()].flatMap((group) => {
    const first = group[0];
    if (first === undefined) {
      return [];
    }
    return group.every((row) => row.state === first.state)
      ? [{ ...first, tool: null }]
      : group;
  });
}
