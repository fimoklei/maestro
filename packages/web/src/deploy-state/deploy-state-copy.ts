import type { NotUpdatedCopy } from "@maestro/core";
import {
  IMPORT_LOCAL_EDITS,
  REGISTER_REPOSITORY,
  rereadLabel,
} from "../ui/control-labels";
import { originNotRead } from "../ui/github-link-copy";
import type { NoticeContent } from "../ui/notice";
import { machine, named, namedList, type Phrase, phrase } from "../ui/phrase";
import { CLEAR_FILTERS } from "../ui/view-options-copy";
import { joinNames } from "./join-names";

// Every word the Deploy-state screen shows outside its dialogs.

export const TARGET_LABEL = "Target";

export const GLOBAL = "Global";
export const REPOSITORIES = "Repositories";

export const TARGETS_FACT = "Targets";

// Register repository on the Repositories screen is the only registration
// control, so every sentence that needs one names both.
export const REGISTER_STEP = `Select ${REGISTER_REPOSITORY} on the Repositories screen`;

// Information, never a control.
export const NO_REPOSITORIES = `No repositories yet. ${REGISTER_STEP}.`;

export const NO_FILTER_MATCH = {
  title: "No targets match the filters",
  description: `Select ${CLEAR_FILTERS} to see every target.`,
};

export const NO_TARGETS = {
  title: "No targets yet",
  description: "Global and registered repositories appear here.",
};

/** The pane's line for behind names that are no deployed skill. */
export const packageBehindNotice = (
  names: readonly string[],
): NoticeContent => ({
  level: "info",
  ...(names.length === 1
    ? {
        label: "Package also behind",
        message: phrase`${namedList(names)} is not a skill.`,
      }
    : {
        label: "Packages also behind",
        message: phrase`${namedList(names)} are not skills.`,
      }),
});

const NOT_READ_LABEL = "Deploy-state not read";
const NOT_READ_PARTS = {
  global: "Global",
  repos: "registered repositories",
} as const;

// The band's one failed-read notice: every part shares the one re-read.
export const deployStateNotRead = (
  parts: readonly (keyof typeof NOT_READ_PARTS)[],
) =>
  ({
    level: "error",
    label: NOT_READ_LABEL,
    message: `Select ${rereadLabel("Deploy-state")} to read every target again.`,
    detail: `Not read: ${joinNames(parts.map((part) => NOT_READ_PARTS[part]))}.`,
  }) as const;
// An unread repository is an Unknown reading: its pane states it in a line, not a notice.
export const REPO_NOT_READ = `${NOT_READ_LABEL}.`;
export const REPO_NOT_READ_LINE = `${NOT_READ_LABEL}. Select ${rereadLabel("Deploy-state")} to read this repository's deploy-state again.`;

// The GitHub column's Unknown cause, also said in the Status card and the pane.
export const ORIGIN_NOT_READ = originNotRead("Deploy-state");

// A selected skill's folder on GitHub, as its ⋮ item.
export const VIEW_SKILL_ON_GITHUB = "View skill on GitHub";

// Import local edits' checking line, and the line beside a blocked Remove skill.
export const CHECKING_LOCAL_EDITS = "Checking for local edits…";

/** The Global pane's sub-list of the folders Global writes. */
export const GLOBAL_FOLDERS = "Global folders";

/** A Global folder's readers, in the Global pane: the only place a detected tool is named. */
export const readByLine = (readBy: {
  tools: readonly string[];
  others: boolean;
}) =>
  `Read by ${joinNames(readBy.others ? [...readBy.tools, "others"] : readBy.tools)}.`;

/** A Global dialog's list of the Global folders its action writes. */
export const WRITES_TO = "Writes to";

/** Beside a Global folder whose tool is not detected. */
export const notDetectedNote = (tool: string) => `${tool} not detected`;

/** Beside a Global folder Global does not write, its tool not detected. */
export const notWrittenNote = (tool: string) =>
  `${notDetectedNote(tool)} · not written`;

/** A Global folder that lacks skills of Global's one skill list. */
export const skillsMissingLine = (
  folder: string,
  missing: number,
  deployed: number,
): Phrase =>
  deployed === 1
    ? phrase`The deployed skill is missing in ${machine(folder)}.`
    : phrase`${missing} of ${deployed} deployed skills ${missing === 1 ? "is" : "are"} missing in ${machine(folder)}.`;

/** Beside an undetected tool's folder: the copies of Global's skills it still holds. */
export const strayCopiesNote = (tool: string, count: number) =>
  count === 0
    ? notWrittenNote(tool)
    : `${notWrittenNote(tool)} · ${count} ${count === 1 ? "copy" : "copies"}`;

/** Why Global reads Not updated: copies in an undetected tool's folder differ from the Target release. */
export const strayDiffersLine = (
  folder: string,
  count: number,
  release: string,
  tool: string,
): Phrase =>
  phrase`${count} ${count === 1 ? "copy" : "copies"} in ${machine(folder)} ${count === 1 ? "differs" : "differ"} from ${machine(release)}. Global does not write there because ${tool} is not detected.`;

/**
 * The copies an undetected tool's folder holds, which OpenCode loads instead
 * of the ones in `instead`, the folder Global writes (#1793).
 */
export function strayCopiesLine(
  folder: string,
  names: readonly string[],
  instead: string,
): Phrase {
  const where = machine(folder);
  const one = names.length === 1;
  return phrase`Global does not update ${namedList(names)} in ${where}. OpenCode loads ${one ? "this copy" : "these copies"} instead of ${one ? "the one" : "the ones"} in ${machine(instead)}. To load the current release, delete ${one ? "it" : "them"} from ${where} yourself.`;
}

/**
 * A Global folder's unedited copies at another release than the Target
 * release. With no release matched, it names none and never says older.
 */
export function notUpdatedLine(
  folder: string,
  copies: readonly NotUpdatedCopy[],
  release: string,
): Phrase {
  const [first] = copies;
  const where = machine(folder);
  const target = machine(release);
  if (first === undefined) return phrase``;
  const subject =
    copies.length === 1
      ? phrase`${named(first.name)} in ${where} is`
      : phrase`${copies.length} skills in ${where} are`;
  const stillAt = new Set(copies.map((copy) => copy.stillAt));
  if (stillAt.has(null)) {
    return phrase`${subject} not at the Target release ${target}.`;
  }
  const at =
    stillAt.size === 1 && first.stillAt !== null
      ? machine(first.stillAt)
      : "older releases";
  return phrase`${subject} still at ${at}, but the Target release is ${target}.`;
}

// The Global group's line while no supported tool is detected.
export const NO_TOOL_DETECTED =
  "Install Claude Code or Codex to deploy skills globally.";

export const otherOriginLine = (origins: readonly string[]) =>
  phrase`Holds skills, hooks and MCP servers deployed from ${namedList(origins)}.`;

const KEEP_LOCAL_EDITS = `Select ${IMPORT_LOCAL_EDITS} to keep them.`;
const KEEP_BEFORE_UPDATE = `To keep them, select ${IMPORT_LOCAL_EDITS} before you update.`;

const localEditsReason = (names: readonly string[]) =>
  names.length === 1
    ? phrase`1 skill has changes that are not in the latest release: ${namedList(names)}.`
    : phrase`${names.length} skills have changes that are not in the latest release: ${namedList(names)}.`;

export const localEditsLine = (names: readonly string[], behind: boolean) =>
  phrase`${localEditsReason(names)} ${behind ? KEEP_BEFORE_UPDATE : KEEP_LOCAL_EDITS}`;

// A skill row's mark carries its reading's hint as its tooltip: one fact, no action.
export const NO_LONGER_RELEASED_HINT = "Not in the latest release.";
export const UNREACHED_HINT = "Update check did not run.";
// Must match the server's timeout on an apm read.
export const TIMED_OUT_HINT = "Update check timed out after 1 minute.";
