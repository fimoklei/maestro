// Every word the Import local edits control and its dialog show.
import type { LocalEditsError } from "@maestro/core";
import { HttpError } from "../api/http";
import { CHANGE_LOCATION_STEP } from "../settings/settings-copy";
import type { NoticeContent } from "../ui/notice";
import { type NoticeTable, noticeFromTable } from "../ui/notice-table";

export const IMPORT_LOCAL_EDITS = "Import local edits";

export const importLocalEditsTitle = (target: string): string =>
  `Import local edits from ${target}`;

export const CHECKING_LOCAL_EDITS = "Checking for local edits…";

export const canBeImportedLegend = (count: number): string =>
  `Can be imported · ${count}`;

export const cannotBeImportedLegend = (count: number): string =>
  `✕ Cannot be imported · ${count}`;

const IMPORT_SKILLS = "Import skills";
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

export const importReportHeading = (landed: number, asked: number): string =>
  `Imported ${landed} of ${asked} ${asked === 1 ? "skill" : "skills"}`;

export const NOT_IMPORTED = "Not imported";
export const IMPORTED = "Imported";
export const IMPORTED_NEXT_STEP =
  "Each is now a Pending proposal on the Harness screen. Select Propose change there.";

const NOT_CHECKED = {
  label: "Local edits not checked",
  message: "Nothing was imported. Select Close, then Import local edits again.",
};

const NOT_CONFIRMED = {
  label: "Import not confirmed",
  message:
    "The Maestro server did not answer, so some skills may have landed. Select Close, then check the Harness screen.",
};

// Headings shared with the other surfaces that meet the same block.
const LOCAL_EDITS_ERRORS: NoticeTable<LocalEditsError> = {
  "not-configured": {
    level: "error",
    label: "No Harness connected",
    message: `${CHANGE_LOCATION_STEP}, then select Import local edits again.`,
  },
  "repo-not-registered": {
    level: "error",
    label: "Repository not registered",
    message:
      "Register this repository in Maestro, then select Import local edits again.",
  },
  "unfinished-operation": {
    level: "error",
    label: "Change not finished",
    message: `An earlier change on this target did not finish. Finish it on the Deploy-state screen, then select ${IMPORT_LOCAL_EDITS} again.`,
  },
  "target-unreadable": {
    level: "error",
    label: "Could not read deployment record",
    message:
      "Nothing was imported. Repair or delete apm.lock.yaml in the target, then select Import local edits again.",
  },
  "import-in-progress": {
    level: "error",
    label: "Harness already changing",
    message:
      "Wait for that change to finish, then select Import local edits again.",
  },
};

export function localEditsCheckNotice(error: unknown): NoticeContent | null {
  return noticeFromTable(LOCAL_EDITS_ERRORS, error, NOT_CHECKED);
}

// A refused run imported nothing; an unanswered one may have landed some.
export function localEditsImportNotice(error: unknown): NoticeContent | null {
  return noticeFromTable(
    LOCAL_EDITS_ERRORS,
    error,
    error instanceof HttpError ? NOT_CHECKED : NOT_CONFIRMED,
  );
}
