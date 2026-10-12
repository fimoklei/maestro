import { DEPLOY_SKILL, rereadLabel } from "../ui/control-labels";
import type { NoticeCopy } from "../ui/notice";

// Shown by both gates while the inventory config read is in flight.
export const LOADING_INVENTORY_CONNECTION = "Loading the Inventory connection…";

// The failed Inventory read on every surface that shows it; the action rides at
// the call site.
export const INVENTORY_NOT_READ = {
  level: "error",
  label: "Inventory not read",
  message: `Select ${rereadLabel("Skills")} to try again.`,
} as const;

export const targetCount = (count: number): string =>
  `${count} ${count === 1 ? "target" : "targets"}`;

// The bulk Remove dialog and its Report (#1436): every count in one and many.
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

// The bulk Remove dialog's confirm: the targets it walks.
export const removeFromCountLabel = (count: number): string =>
  `Remove from ${count} ${count === 1 ? "target" : "targets"}`;
