import { DEPLOY_SKILL } from "../inventory/inventory-copy";
import type { FootItem } from "../ui/foot-actions";
import type { TargetAction, TargetTableRow } from "./deploy-state-columns";
import { VIEW_REPOSITORY_ON_GITHUB } from "./deploy-state-copy";
import { RETRY_LABELS } from "./release-head-copy";
import type { TargetRow } from "./target-rows";
import { UPDATE_TARGET } from "./update-target-copy";

export type MenuFacts = Pick<TargetRow, "behind" | "pending">;

export function targetMenuItems(
  row: MenuFacts,
  retrying: boolean,
): TargetTableRow["actions"] {
  const items: TargetTableRow["actions"] = [
    { action: "deploy", label: DEPLOY_SKILL },
    ...(row.behind
      ? [{ action: "update" as const, label: UPDATE_TARGET }]
      : []),
  ];
  // A standing operation is the next step, so its retry leads (#1066).
  return row.pending && !retrying
    ? [{ action: "retry", label: RETRY_LABELS[row.pending.kind] }, ...items]
    : items;
}

// The GitHub column's page, for the keyboard: the grid keeps the cell's link
// out of the Tab order (design.md → Frame, #1180).
export const targetLinkItems = (
  row: Pick<TargetRow, "github">,
): TargetTableRow["links"] =>
  row.github?.kind === "link"
    ? [{ label: VIEW_REPOSITORY_ON_GITHUB, href: row.github.url }]
    : [];

// One row's items, the same in its ⋮ menu and at its pane's foot.
export const targetRowItems = (
  row: TargetTableRow,
  onAction: (row: TargetTableRow, action: TargetAction) => void,
): FootItem[] => [
  ...row.actions.map((item) => ({
    label: item.label,
    // Update target names the target it moves (spec story 32).
    ...(item.action === "update" && !item.disabled
      ? { name: `${UPDATE_TARGET} ${row.updateName}` }
      : {}),
    disabled: item.disabled,
    onSelect: () => onAction(row, item.action),
  })),
  ...row.links,
];
