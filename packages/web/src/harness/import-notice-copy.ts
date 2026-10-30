import type {
  ImportNameBlocker,
  ImportSkillError,
  ImportSourceBlocker,
  LocalEditsRefusal,
  LocalEditsSkill,
} from "@maestro/core";
import { CHANGE_LOCATION_STEP } from "../settings/settings-copy";
import {
  IMPORT_LOCAL_EDITS,
  IMPORT_SKILL,
  PROPOSE_CHANGE,
  UPDATE_SKILL,
} from "../ui/control-labels";
import { CLOSE } from "../ui/dialog-copy";
import type { NoticeContent } from "../ui/notice";
import { type NoticeTable, noticeFromTable } from "../ui/notice-table";
import { machine, type Phrase, phrase, plainText } from "../ui/phrase";
import { harnessHeadings } from "./notice-copy";

// Covers the import mutation and the check that runs before it: both blocker
// unions are subsets of this one, so a picked folder and a refused copy name
// the same fault the same way.
const importHeadings: NoticeTable<ImportSkillError> = {
  "not-configured": {
    ...harnessHeadings["not-configured"],
    message: `${CHANGE_LOCATION_STEP}, then select ${IMPORT_SKILL} again.`,
  },
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
  "harness-copy-uncommitted": {
    level: "error",
    label: "Uncommitted changes in the Harness",
    message: `Nothing was copied. Commit or undo them in your Git tool, then select ${UPDATE_SKILL} again.`,
    detail: "Updating now would overwrite changes Git cannot restore.",
  },
  "harness-unreadable": {
    level: "error",
    label: "Harness clone not read",
    message: `Nothing was copied. Make the Harness clone readable, then select ${UPDATE_SKILL} again.`,
    detail:
      "Maestro reads the clone's committed state before replacing a skill.",
  },
  // Info, not error: the folder is the right one and nothing is wrong with it,
  // there is simply nothing in it to carry back (#733).
  "nothing-to-carry-back": {
    level: "info",
    label: "Folder already matches",
    message: `This folder already matches the skill in the Harness. Select ${CLOSE}.`,
    detail: "Choose a folder with changes to update the skill.",
  },
  "missing-manifest": {
    level: "error",
    label: "No SKILL.md",
    message: "Choose the folder that holds the skill's SKILL.md.",
  },
  "invalid-frontmatter": {
    level: "error",
    label: "Unreadable frontmatter",
    message: `Fix the SKILL.md frontmatter, then select ${IMPORT_SKILL} again.`,
    detail: "Maestro cannot read the skill's name or description.",
  },
  "empty-description": {
    level: "error",
    label: "Empty description",
    message: `Fill in the description in SKILL.md, then select ${IMPORT_SKILL} again.`,
    detail: "The description tells an agent when to reach for the skill.",
  },
  "invalid-name": {
    level: "error",
    label: "Unusable skill name",
    message:
      "A skill name uses lowercase letters, digits and single hyphens, like code-review.",
  },
  "name-taken": {
    level: "error",
    label: "Name taken",
    message: "The Harness already holds a skill under it. Pick another name.",
  },
  "not-found": {
    level: "error",
    label: "Folder gone",
    message: "Nothing was copied. Choose the folder again.",
  },
  "not-a-directory": {
    level: "error",
    label: "Not a folder",
    message: "A skill is a folder with a SKILL.md in it. Choose one of those.",
  },
  "destination-exists": {
    level: "error",
    label: "Name taken",
    message: "The Harness already holds a folder under it. Pick another name.",
  },
  "unsafe-link": {
    level: "error",
    label: "Symbolic link inside",
    message: `Nothing was copied. Replace the link with a real file, then select ${IMPORT_SKILL} again.`,
    detail: "Maestro will not follow one into somewhere else on disk.",
  },
  "hard-linked-file": {
    level: "error",
    label: "Shared file inside",
    message: `Nothing was copied. Replace it with a plain copy, then select ${IMPORT_SKILL} again.`,
    detail: "Copying it would tie the Harness to a file it does not own.",
  },
  "special-file": {
    level: "error",
    label: "Special file inside",
    message: `Nothing was copied. Take it out of the folder, then select ${IMPORT_SKILL} again.`,
    detail: "Maestro carries plain files and folders only.",
  },
  "too-many-files": {
    level: "error",
    label: "Over 1,000 files",
    message:
      "Nothing was copied. Choose the skill folder itself, not the repository around it.",
  },
  "too-large": {
    level: "error",
    label: "Over 50 MiB",
    message:
      "Nothing was copied. Choose the skill folder itself, not the repository around it.",
  },
  "source-changed": {
    level: "error",
    label: "Folder changed during import",
    message: `The skill was not imported. Let the folder change finish, then select ${IMPORT_SKILL} again.`,
  },
  "copy-failed": {
    level: "error",
    label: "Skill not imported",
    message: `The skill was not imported. Free up disk space, then select ${IMPORT_SKILL} again.`,
  },
  "destination-unsafe": {
    level: "error",
    label: "Skills folder outside the Harness",
    message:
      "Nothing was copied. Make the clone's skills folder a real folder inside it.",
  },
};

export const importNotice = (error: unknown): NoticeContent | null =>
  noticeFromTable(importHeadings, error, {
    label: "Skill not imported",
    message: `The Maestro server did not answer, and nothing reached the Harness. Select ${IMPORT_SKILL} again.`,
  });

// The check's refusals never travel as an HTTP failure — they come back in a
// successful reply. The table's own sentence stands unless the dialog's way
// through differs, which `import-view-model` says where it does.
export const importBlockerNotice = (
  blocker: ImportSourceBlocker | ImportNameBlocker,
  message?: string,
): NoticeContent =>
  message === undefined
    ? importHeadings[blocker]
    : { ...importHeadings[blocker], message };

export const copiesDiffer = (
  folders: Record<"claude" | "codex", string>,
): Phrase =>
  phrase`The Claude Code and Codex copies differ. Select ${IMPORT_SKILL} on the Harness screen and choose one: ${machine(folders.claude)} or ${machine(folders.codex)}.`;

// Import skill's sentences where they work from this dialog, retried with
// Import local edits. Where Import skill says to pick a folder, this dialog
// has none, so the way through is the manual copy or the deployed copy itself.
// Import skill refuses another Harness and an unproven origin too, so its
// route is no way through for either.
const LOCAL_EDITS_REFUSALS: Record<LocalEditsRefusal, string> = {
  "not-configured": `${CHANGE_LOCATION_STEP}, then select ${IMPORT_LOCAL_EDITS} again.`,
  "destination-unsafe": `Nothing was copied. Make the clone's skills folder a real folder inside it, then select ${IMPORT_LOCAL_EDITS} again.`,
  "source-unreadable": `Nothing was copied. Make the folder readable, then select ${IMPORT_LOCAL_EDITS} again.`,
  "outside-root":
    "Maestro reads only inside your home folder, and this copy is outside it. Copy the changed files into the Harness clone yourself.",
  "deployed-copy":
    "Deployed by another Harness. Make the change in that Harness.",
  "origin-unproven":
    "The deployment record does not name this copy's Harness. Copy the changed files into the Harness clone yourself.",
  "missing-manifest": `This copy has no SKILL.md. Put it back, then select ${IMPORT_LOCAL_EDITS} again.`,
  "invalid-frontmatter": `Fix the SKILL.md frontmatter, then select ${IMPORT_LOCAL_EDITS} again.`,
  "empty-description": `Fill in the description in SKILL.md, then select ${IMPORT_LOCAL_EDITS} again.`,
  "harness-copy-uncommitted": `The Harness clone has uncommitted changes to this skill. Undo them, or select ${PROPOSE_CHANGE}, merge on GitHub and pull first.`,
  "harness-unreadable": `Nothing was copied. Make the Harness clone readable, then select ${IMPORT_LOCAL_EDITS} again.`,
  "nothing-to-carry-back":
    "The Harness already has these changes. See the skill on the Harness screen.",
  "invalid-name":
    "The deployment record gives this skill a name the Harness cannot use. Copy the changed files into the Harness clone yourself.",
  "name-taken":
    "The Harness already holds a skill under this name. Copy the changed files into the Harness clone yourself.",
  "not-found": `Nothing was copied. The deployed folder is gone. Select ${CLOSE}, then select ${IMPORT_LOCAL_EDITS} again.`,
  "not-a-directory": `Nothing was copied. The deployed copy is no longer a folder. Select ${CLOSE}, then select ${IMPORT_LOCAL_EDITS} again.`,
  "destination-exists":
    "The Harness already holds a folder under this name. Copy the changed files into the Harness clone yourself.",
  "unsafe-link": `Nothing was copied. Replace the symbolic link in the skill folder with a real file, then select ${IMPORT_LOCAL_EDITS} again.`,
  "hard-linked-file": `Nothing was copied. Replace the shared file in the skill folder with a plain copy, then select ${IMPORT_LOCAL_EDITS} again.`,
  "special-file": `Nothing was copied. Take the special file out of the skill folder, then select ${IMPORT_LOCAL_EDITS} again.`,
  "too-many-files": `Nothing was copied. This copy holds over 1,000 files. Remove the files the skill does not need, then select ${IMPORT_LOCAL_EDITS} again.`,
  "too-large": `Nothing was copied. This copy is over 50 MiB. Remove the files the skill does not need, then select ${IMPORT_LOCAL_EDITS} again.`,
  "source-changed": `The skill was not imported. Let the folder change finish, then select ${IMPORT_LOCAL_EDITS} again.`,
  "copy-failed": `The skill was not imported. Free up disk space, then select ${IMPORT_LOCAL_EDITS} again.`,
  // A record may name this Harness and still not list the folder.
  "not-an-update":
    "The deployment record does not list this folder, so Maestro cannot tell which skill it updates. Copy the changed files into the Harness clone yourself.",
  unverified:
    "Maestro holds no record of this copy's deployed files. Copy the changed files into the Harness clone yourself.",
  "copies-differ": `The Claude Code and Codex copies differ. Select ${IMPORT_SKILL} on the Harness screen and choose one.`,
  "no-local-edits": "No local edits left in this copy. Nothing was imported.",
  "undoes-newer-changes": `The Harness changed this skill after the check, so it was not imported. Select ${IMPORT_LOCAL_EDITS} again to choose whether to undo that change.`,
};

// One sentence under a skill Import local edits did not carry back.
export function localEditsRefusal({
  refusal,
  folders,
}: Pick<LocalEditsSkill, "folders"> & { refusal: LocalEditsRefusal }): string {
  return folders === undefined
    ? LOCAL_EDITS_REFUSALS[refusal]
    : plainText(copiesDiffer(folders));
}
