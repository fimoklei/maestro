import {
  toolDisplayName,
  toolNameList,
} from "../deploy-state/tool-presentation";
import type { NoticeCopy } from "../ui/notice";

// Shown by both gates while the inventory config read is in flight.
export const LOADING_INVENTORY_CONNECTION = "Loading the Inventory connection…";

// The failed Inventory read on every surface that shows it; the action rides at
// the call site.
export const INVENTORY_NOT_READ = {
  level: "error",
  label: "Could not read Inventory",
  message: "Select Re-read Inventory to try again.",
} as const;

// Empty is an offer, not a failure: the action is the one step that fills the list.
export const NO_RELEASED_SKILLS = {
  level: "info",
  label: "No released skills yet",
  message: "Skills from the latest release appear here.",
} as const;

// The Inventory's band 2 and table (#1040).
export const SEARCH_LABEL = "Search the Inventory";
export const REREAD_LABEL = "Re-read Inventory";
export const NO_SKILLS_YET = "no skills yet";
export const STAGE_COLUMN_LABEL = "Select for bulk deploy";
export const stageRowLabel = (name: string) => `Select ${name} for bulk deploy`;
export const SELECT_ALL_LABEL = "Select all for bulk deploy";

// The selection bar's action and the dialog it opens (#992, #1042).
export const DEPLOY_SKILLS = "Deploy skills";
export const bulkDeployTitle = (count: number): string =>
  `Deploy ${count} ${count === 1 ? "skill" : "skills"}`;
export const BULK_DEPLOY_TARGET = "Target";
export const bulkDeployDidNotRun = (target: string) =>
  `Deploy to ${target} did not run`;
export const TARGETS_LOADING = "targets still loading";
export const NO_TOOL_DETECTED_CAUSE = "no tool detected";
export const TARGETS_STILL_CHECKING = "checking for local edits";
export const NO_TARGET_REMOVABLE = "no target can be removed";

// The bulk Remove dialog's clean targets: a removal there loses no work.
export const cleanCopiesNotice = (count: number): NoticeCopy => ({
  label: `${count} clean ${count === 1 ? "copy" : "copies"}`,
  message: "Only the deployed files are removed.",
});

// The bulk-deploy picker's Global option. undefined = not loaded or
// unreadable → plain "Global"; empty = zero detected tools (#134).
export function globalOptionLabel(
  tools: readonly string[] | undefined,
): string {
  if (tools === undefined) {
    return "Global";
  }
  if (tools.length === 0) {
    return "Global (no tool detected)";
  }
  return `Global (${tools.map(toolDisplayName).join(" + ")})`;
}

export const NO_SEARCH_MATCH =
  "No skills match the search. Clear the search box to see every skill.";
export const NO_FILTER_MATCH =
  "No skills match the filters. Select Filter to show more skills.";

// The row's hover card and detail pane (#1041).
export const deployedToLine = (count: number): string =>
  count === 0
    ? "Not deployed to any target."
    : `Deployed to ${count} ${count === 1 ? "target" : "targets"}`;
export const moreTargetsLine = (more: number): string => `And ${more} more.`;
export const SOME_TARGETS_NOT_READ = "Some targets could not be read.";
export const NOT_DEPLOYED_ANYWHERE =
  "Not deployed to any target. Select Deploy skill to choose a target.";

// A target row's ⋮ in the pane, and the foot's removal (#1065). The count is
// the targets the pane lists: a global deploy is one target per tool.
export const REMOVE_FROM_TARGET = "Remove from target";
// A global row's removal takes every detected tool.
export const removeFromToolsLabel = (tools: readonly string[]): string =>
  `Remove from ${toolNameList(tools)}`;
export const SHOW_IN_DEPLOY_STATE = "Show in Deploy-state";
export const removeFromAllLabel = (count: number): string =>
  `Remove from all ${count} targets`;

// The row's ⋮ menu (#992).
export const ACTIONS_COLUMN_LABEL = "Actions";
export const rowActionsLabel = (name: string) => `Actions for ${name}`;
export const DEPLOY_SKILL = "Deploy skill";
