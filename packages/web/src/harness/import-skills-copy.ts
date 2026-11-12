// Every word Import skills shows.

import type {
  ImportSkillError,
  ImportSkillsError,
  SkillsFolderBlocker,
} from "@maestro/core";
import { HttpError } from "../api/http";
import {
  ALREADY_IN_HARNESS,
  NOT_CONFIRMED,
} from "../deploy-state/import-local-edits-copy";
import { CHANGE_LOCATION_STEP } from "../settings/settings-copy";
import { HARNESS_BUSY } from "../ui/busy-copy";
import { IMPORT_SKILLS } from "../ui/control-labels";
import type { NoticeContent, NoticeCopy } from "../ui/notice";
import { type NoticeTable, noticeFromTable } from "../ui/notice-table";
import { harnessHeadings } from "./notice-copy";

export const IMPORT_SKILLS_HINT =
  "Choose a skill folder, or a folder of skill folders.";
export const IMPORT_SKILLS_PLACEHOLDER = "/path/to/skills";
export const SKILLS_FOLDER_MISSING =
  "Enter the absolute path of the folder that contains your skills.";
export const READING_FOLDER = "Reading the folder…";

export const NO_SKILL_FOLDERS: NoticeCopy = {
  label: "No skills in this folder",
  message: `A skill folder holds a SKILL.md. ${IMPORT_SKILLS_HINT}`,
};

const AGAIN = `then select ${IMPORT_SKILLS} again.`;

// A row's reason and its next step, under its name. "The folder" is the row's
// own; "choose the folder again" means the one in Folder path, which lists the
// rows anew.
const REFUSAL: Record<ImportSkillError, string> = {
  "source-unreadable":
    "Maestro cannot read this folder. Make it readable, then choose the folder again.",
  "outside-root":
    "This folder links outside your home folder, so Maestro cannot read it. Move the skill into your home folder, then choose the folder again.",
  "deployed-copy":
    "Another Harness deployed this copy. Import the skill from that Harness's clone instead.",
  "origin-unproven":
    "The deployment record does not name this copy's Harness. Copy the skill's files into the Harness clone yourself.",
  "missing-manifest": "This folder has no SKILL.md, so it is not a skill.",
  "invalid-frontmatter":
    "Maestro cannot read the SKILL.md frontmatter. Fix it, then choose the folder again.",
  "empty-description":
    "SKILL.md has an empty description. Add one, then choose the folder again.",
  "invalid-name":
    "Maestro cannot make a skill name from this folder name. Give the folder a name like code-review, then choose the folder again.",
  // A held skill is listed apart, so this reaches only the Report: the name
  // was taken after the scan.
  "name-taken": `The Harness already contains a skill with this name. To replace it, select ${IMPORT_SKILLS} again. Choose the folder, then check it under ${ALREADY_IN_HARNESS}.`,
  "destination-exists":
    "The Harness already contains a folder under this name. Rename the folder, then choose the folder again.",
  "not-found": "The folder was moved or deleted before Maestro could copy it.",
  "not-a-directory": "This is no longer a folder, so Maestro did not copy it.",
  "source-changed": `The folder changed during the import. Wait for the change to finish, ${AGAIN}`,
  "unsafe-link": `The folder contains a symbolic link. Replace the link with a real file, ${AGAIN}`,
  "hard-linked-file": `The folder contains a hard-linked file. Replace that file with a plain copy, ${AGAIN}`,
  "special-file": `The folder contains a special file. Take it out, ${AGAIN}`,
  "too-many-files": `The folder contains over 1,000 files. Remove the files the skill does not need, ${AGAIN}`,
  "too-large": `The folder is over 50 MiB. Remove the files the skill does not need, ${AGAIN}`,
  "copy-failed": `The copy failed. Free up disk space, ${AGAIN}`,
  "destination-unsafe": `The skills folder in the Harness clone links outside the clone. Make it a real folder, ${AGAIN}`,
  // The guards a replace of a held skill passes; they show in the checklist
  // and in the Report alike.
  "harness-copy-uncommitted": `The Harness clone has uncommitted changes to this skill. Commit or undo them, ${AGAIN}`,
  "harness-unreadable": `Maestro cannot read the Harness clone. Make it readable, ${AGAIN}`,
  "nothing-to-carry-back":
    "This folder already matches the skill in the Harness.",
  "not-configured": `${CHANGE_LOCATION_STEP}, ${AGAIN}`,
};

/** One sentence under a folder Import skills cannot import. */
export const skillFolderRefusal = (refusal: ImportSkillError): string =>
  REFUSAL[refusal];

// Why the chosen folder itself lists nothing, beside Folder path.
const FOLDER_BLOCKERS: Record<SkillsFolderBlocker, NoticeContent> = {
  "source-unreadable": {
    level: "error",
    label: "Folder not read",
    message:
      "Nothing was copied. Make the folder readable, then choose it again.",
  },
  "outside-root": {
    level: "error",
    label: "Folder out of reach",
    message: "Choose a folder inside your home folder.",
    detail: "Maestro reads inside the home folder only.",
  },
  "deployed-copy": {
    level: "error",
    label: "Copy from another Harness",
    message: "Choose a folder that is not a copy deployed by another Harness.",
    detail: "Maestro can update only copies deployed by the connected Harness.",
  },
  "origin-unproven": {
    level: "error",
    label: "Origin not recorded",
    message: "Copy the skill's files into the Harness clone yourself.",
    detail: "The deployment record does not name this copy's Harness.",
  },
};

export const folderBlockerNotice = (
  blocker: SkillsFolderBlocker | null,
): NoticeContent | null => (blocker === null ? null : FOLDER_BLOCKERS[blocker]);

const ERRORS: NoticeTable<ImportSkillsError> = {
  "not-configured": {
    ...harnessHeadings["not-configured"],
    message: `${CHANGE_LOCATION_STEP}, ${AGAIN}`,
  },
  "import-in-progress": {
    level: "error",
    label: HARNESS_BUSY,
    message: `Wait for that change to finish, ${AGAIN}`,
  },
};

const NOT_READ: NoticeCopy = {
  label: "Folder not read",
  message: `The Maestro server did not respond. Select ${IMPORT_SKILLS} to read the folder again.`,
};

export const importSkillsScanNotice = (error: unknown): NoticeContent | null =>
  noticeFromTable(ERRORS, error, NOT_READ);

// A refused request imported nothing; a server that broke or never answered
// may have landed some.
export const importSkillsNotice = (error: unknown): NoticeContent | null =>
  noticeFromTable(
    ERRORS,
    error,
    error instanceof HttpError && error.status < 500
      ? {
          label: "Skills not imported",
          message: `Nothing was imported. Select ${IMPORT_SKILLS} again.`,
        }
      : NOT_CONFIRMED,
  );
