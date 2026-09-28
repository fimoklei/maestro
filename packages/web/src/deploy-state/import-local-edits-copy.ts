// Every word the Import local edits… control and its dialog show.
import { HttpError } from "../api/http";
import type { NoticeContent } from "../ui/notice";
import { noticeFromTable } from "../ui/notice-table";

export const IMPORT_LOCAL_EDITS = "Import local edits…";

export const importLocalEditsTitle = (target: string): string =>
  `Import local edits from ${target}`;

export const CHECKING_LOCAL_EDITS = "Checking for local edits…";

export const canBeImportedLegend = (count: number): string =>
  `Can be imported · ${count}`;

export const cannotBeImportedLegend = (count: number): string =>
  `✕ Cannot be imported · ${count}`;

export const IMPORT_SKILLS = "Import skills";
export const NONE_SELECTED = "none selected";
export const NO_SKILL_QUALIFIES = "no skill qualifies";

export const NO_LOCAL_EDITS = "No local edits";

export const noLocalEditsLine = (target: string): string =>
  `No skill on ${target} changed after deployment.`;

export const undoesNewerLegend = (count: number): string =>
  `▲ Undoes newer Harness changes · ${count}`;

export const undoesNewerLine = (release: string): string =>
  `Deployed from release ${release}. Importing undoes newer Harness changes to this skill.`;

// `undoing` counts the checked skills that undo newer Harness changes.
export const importConfirmLabel = (count: number, undoing: number): string => {
  if (count === 0) return IMPORT_SKILLS;
  const label = `Import ${count} ${count === 1 ? "skill" : "skills"}`;
  return undoing === 0
    ? label
    : `${label} · ${undoing} ${undoing === 1 ? "undoes" : "undo"} newer changes`;
};

export const importedToast = (names: readonly string[]): string =>
  names.length === 1
    ? `Imported ${names[0]}.`
    : `Imported ${names.length} skills.`;

export const importReportHeading = (landed: number, asked: number): string =>
  `Imported ${landed} of ${asked} ${asked === 1 ? "skill" : "skills"}`;

export const NOT_IMPORTED = "Not imported";
export const IMPORTED = "Imported";
export const IMPORTED_NEXT_STEP =
  "Each is now a Pending proposal on the Harness screen. Select Propose change there.";

const NOT_CHECKED = {
  label: "Local edits not checked",
  message:
    "Nothing was imported. Select Close, then Import local edits… again.",
};

const HARNESS_CHANGING = {
  label: "Harness already changing",
  message:
    "Wait for that change to finish, then select Import local edits… again.",
};

const NOT_CONFIRMED = {
  label: "Import not confirmed",
  message:
    "The Maestro server did not answer, so some skills may have landed. Select Close, then check the Harness screen.",
};

export function localEditsCheckNotice(error: unknown): NoticeContent | null {
  return noticeFromTable({}, error, NOT_CHECKED);
}

// A refused run imported nothing; an unanswered one may have landed some.
export function localEditsImportNotice(error: unknown): NoticeContent | null {
  if (error instanceof HttpError && error.code !== "import-in-progress") {
    return noticeFromTable({}, error, NOT_CHECKED);
  }
  return noticeFromTable(
    { "import-in-progress": { level: "error", ...HARNESS_CHANGING } },
    error,
    NOT_CONFIRMED,
  );
}
