import { joinNames } from "./join-names";

// Every word the Deploy-state screen shows outside its dialogs (ADR-0025).

export const REREAD_LABEL = "Re-read Deploy-state";
export const FILTER_LABEL = "Filter";
export const DISPLAY_LABEL = "Display";
export const TABLE_LABEL = "Deploy-state table";
export const ACTIONS_COLUMN_LABEL = "Actions";

// The two group headers (CONTEXT.md → Target).
export const GLOBAL = "Global";
export const REPOSITORIES = "Repositories";

export const NOTHING_DEPLOYED =
  "Nothing deployed — deploy a skill from Inventory";
export const targetCount = (count: number) =>
  `${count} ${count === 1 ? "target" : "targets"}`;

// Information, never a control: Register repository on the Repositories screen
// is the single registration affordance (ADR-0015).
export const NO_REPOSITORIES =
  "No repositories registered. Select Register repository on the Repositories screen to register one.";

export const NO_FILTER_MATCH =
  "No targets match the filters. Select Filter to show more targets.";

// A read failure is `{the thing} not read`; its way out is Re-read (CONTEXT.md).
export const GLOBAL_NOT_READ = {
  level: "error",
  label: "Global targets not read",
  message: `Select ${REREAD_LABEL} to read the global targets again.`,
} as const;
export const REPOS_NOT_READ = {
  level: "error",
  label: "Registered repositories not read",
  message: `Select ${REREAD_LABEL} to read the registered repositories again.`,
} as const;
export const REPO_NOT_READ = {
  level: "error",
  label: "Deploy-state not read",
  message: `Select ${REREAD_LABEL} to read this repository's deploy-state again.`,
} as const;

export const NO_TOOL_DETECTED = {
  level: "info",
  label: "No supported tool detected",
  message: "Install Claude Code or Codex to deploy skills globally.",
} as const;

export const otherOriginLine = (origins: readonly string[]) =>
  `Holds primitives deployed from ${joinNames(origins)}.`;

// A skill row's mark carries its reading's hint as its tooltip.
export const NO_LONGER_RELEASED_HINT =
  "This deployed skill is absent from the latest release";
export const UNREACHED_HINT =
  "Could not reach the Harness location to check for updates";
