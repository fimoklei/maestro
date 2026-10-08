import { namedList, phrase } from "../ui/phrase";
import { joinNames } from "./join-names";

// Every word the Deploy-state screen shows outside its dialogs.

export const REREAD_LABEL = "Re-read Deploy-state";
export const REMOVE_SKILL = "Remove skill";
export const TARGET_LABEL = "Target";
export const ACTIONS_COLUMN_LABEL = "Actions";

export const GLOBAL = "Global";
export const REPOSITORIES = "Repositories";

export const NOTHING_DEPLOYED = "Nothing deployed yet";
export const targetCount = (count: number) =>
  `${count} ${count === 1 ? "target" : "targets"}`;

// Information, never a control: Register repository on the Repositories screen
// is the only registration control.
export const NO_REPOSITORIES =
  "No repositories registered yet. Select Register repository on the Repositories screen.";

export const NO_FILTER_MATCH =
  "No targets match the filters. Select Filter to show more targets.";

const NOT_READ_LABEL = "Deploy-state not read";
const NOT_READ_PARTS = {
  global: "global targets",
  repos: "registered repositories",
} as const;

// The band's one failed-read notice: every part shares the one re-read.
export const deployStateNotRead = (
  parts: readonly (keyof typeof NOT_READ_PARTS)[],
) =>
  ({
    level: "error",
    label: NOT_READ_LABEL,
    message: `Select ${REREAD_LABEL} to read every target again.`,
    detail: `Not read: ${joinNames(parts.map((part) => NOT_READ_PARTS[part]))}.`,
  }) as const;
// An unread repository is an Unknown reading: its pane states it in a line, not a notice.
export const REPO_NOT_READ = NOT_READ_LABEL;
export const REPO_NOT_READ_LINE = `${NOT_READ_LABEL}. Select ${REREAD_LABEL} to read this repository's deploy-state again.`;

// The GitHub column's keyboard way to the same page, and its Unknown's cause.
export const VIEW_REPOSITORY_ON_GITHUB = "View repository on GitHub";
export const ORIGIN_NOT_READ = `The origin of this repository could not be read. Select ${REREAD_LABEL} to read it again.`;

// A selected skill's folder on GitHub: its menu item, and its Unknown's cause.
export const VIEW_SKILL_ON_GITHUB = "View skill on GitHub";
export const HARNESS_ORIGIN_NOT_READ = `The origin of the Harness could not be read. Select ${REREAD_LABEL} to read it again.`;

// The Global group's line while no supported tool is detected.
export const NO_TOOL_DETECTED =
  "Install Claude Code or Codex to deploy skills globally.";

export const otherOriginLine = (origins: readonly string[]) =>
  phrase`Holds skills, hooks and MCP servers deployed from ${namedList(origins)}.`;

const KEEP_LOCAL_EDITS = "Select Import local edits to keep them.";
const KEEP_BEFORE_UPDATE =
  "To keep them, select Import local edits before you update.";

export const localEditsReason = (names: readonly string[]) =>
  names.length === 1
    ? phrase`1 skill has changes that are not in the latest release: ${namedList(names)}.`
    : phrase`${names.length} skills have changes that are not in the latest release: ${namedList(names)}.`;

export const localEditsLine = (names: readonly string[], behind: boolean) =>
  phrase`${localEditsReason(names)} ${behind ? KEEP_BEFORE_UPDATE : KEEP_LOCAL_EDITS}`;

// A skill row's mark carries its reading's hint as its tooltip: one fact, no action.
export const NO_LONGER_RELEASED_HINT = "Not in the latest release.";
export const UNREACHED_HINT = "Update check did not run.";
