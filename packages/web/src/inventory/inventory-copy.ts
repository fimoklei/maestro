import {
  toolDisplayName,
  toolNameList,
} from "../deploy-state/tool-presentation";
import { DEPLOY_SKILL, rereadLabel } from "../ui/control-labels";
import type { NoticeCopy } from "../ui/notice";
import { CLEAR_FILTERS } from "../ui/view-options-copy";

// Shown by both gates while the inventory config read is in flight.
export const LOADING_INVENTORY_CONNECTION = "Loading the Inventory connection…";

// The failed Inventory read on every surface that shows it; the action rides at
// the call site.
export const INVENTORY_NOT_READ = {
  level: "error",
  label: "Inventory not read",
  message: `Select ${rereadLabel("Inventory")} to try again.`,
} as const;

// Empty is an offer, not a failure: the action is the one step that fills the list.
export const NO_RELEASED_SKILLS = {
  title: "No released skills yet",
  description: "Skills from the latest release appear here.",
};

// The Inventory's band 2 and table (#1040).
export const SEARCH_LABEL = "Search the Inventory";
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

const targetCount = (count: number): string =>
  `${count} ${count === 1 ? "target" : "targets"}`;

// The bulk Remove dialog and its Report (#1436): every count in one and many.
export const bulkRemoveTitle = (skillName: string, count: number): string =>
  `Remove ${skillName} from ${targetCount(count)}`;
export const bulkRemoveConfirmLabel = (
  removable: number,
  losing: number,
): string =>
  losing === 0
    ? `Remove from ${targetCount(removable)}`
    : `Remove from ${targetCount(removable)} · ${losing} ${losing === 1 ? "loses" : "lose"} local edits`;
export const checkingTargetsLine = (total: number, answered: number): string =>
  `Checking ${targetCount(total)} — ${answered} answered`;
export const bulkRemoveReportHeading = (
  removed: number,
  total: number,
): string =>
  removed === total
    ? `Removed from ${targetCount(total)}`
    : `Removed from ${removed} of ${targetCount(total)}`;

// The bulk Remove dialog's targets where a removal loses no work.
export const targetsWithoutLocalEditsNotice = (count: number): NoticeCopy => ({
  label: `${targetCount(count)} without local edits`,
  message: "Only the deployed files are removed.",
});

// The way out for a target the removal left alone because its files changed.
export const LOCAL_CHANGES_NEXT_STEP = `Select ${DEPLOY_SKILL} to restore the released files. Then remove the skill.`;
export const PINNED_LOCAL_CHANGES_NEXT_STEP =
  "Save the changes. Restore the files from the skill's deployed version in the Harness clone. Then remove the skill.";

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

export const NO_SEARCH_MATCH = {
  title: "No skills match the search",
  description: "Clear the search box to see every skill.",
};
export const NO_FILTER_MATCH = {
  title: "No skills match the filters",
  description: `Select ${CLEAR_FILTERS} to see every skill.`,
};

// Band 1's count once a search or filter hides a skill.
export const shownSkillsMeta = (shown: number, total: number): string => {
  const skills = `${total} ${total === 1 ? "skill" : "skills"}`;
  return shown === total ? skills : `${shown} of ${skills}`;
};

// The row's hover card and detail pane (#1041).
export const deployedToLine = (count: number): string =>
  count === 0
    ? "Not deployed to any target."
    : `Deployed to ${count} ${count === 1 ? "target" : "targets"}.`;
export const moreTargetsLine = (more: number): string => `And ${more} more.`;
export const SOME_TARGETS_NOT_READ = "Some targets could not be read.";
export const NOT_DEPLOYED_ANYWHERE = `Not deployed to any target. Select ${DEPLOY_SKILL} to choose a target.`;

// A target row's ⋮ in the pane, and the foot's removal (#1065). The count is
// the targets the removal covers: global is one, whatever its tools (#1436).
export const REMOVE_FROM_TARGET = "Remove from target";
// A global row's removal takes every detected tool.
export const removeFromToolsLabel = (tools: readonly string[]): string =>
  `Remove from ${toolNameList(tools)}`;
export const removeFromAllLabel = (count: number): string =>
  `Remove from all ${count} targets`;
