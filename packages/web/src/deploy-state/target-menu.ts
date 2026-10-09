import {
  DEPLOY_SKILL,
  IMPORT_LOCAL_EDITS,
  UPDATE_TARGET,
} from "../ui/control-labels";
import type { FootItem } from "../ui/foot-actions";
import { VIEW_REPOSITORY_ON_GITHUB } from "../ui/github-link-copy";
import type { RowMenuItem } from "../ui/row-menu";
import type { TargetAction, TargetTableRow } from "./deploy-state-columns";

import { RETRY_LABELS } from "./release-head-copy";
import { canImportLocalEdits, type TargetRow } from "./target-rows";
import { updateLabel } from "./update-target-copy";

export type MenuFacts = Pick<
  TargetRow,
  "behind" | "pending" | "wire" | "primitives"
>;

export function targetMenuItems(
  row: MenuFacts,
  retrying: boolean,
): TargetTableRow["actions"] {
  // Carrying edits back comes first: Update target would overwrite them.
  const importable = row.primitives.some((primitive) =>
    canImportLocalEdits(row.pending, primitive),
  );
  const items: TargetTableRow["actions"] = [
    ...(importable
      ? [{ action: "import" as const, label: IMPORT_LOCAL_EDITS }]
      : []),
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

type MenuItem = TargetTableRow["actions"][number];

// One ⋮ item as a control, for the menu and the pane.
export const targetRowItem = (
  row: Pick<TargetTableRow, "name" | "updateName">,
  item: MenuItem,
  onSelect: (action: TargetAction) => void,
): FootItem => {
  const control = {
    disabled: item.disabled,
    onSelect: () => onSelect(item.action),
  };
  if (item.action !== "update" || item.disabled) {
    return { label: item.label, ...control };
  }
  const label = updateLabel(row);
  return { label, name: `${label} ${row.updateName}`, ...control };
};

// One row's items, as its ⋮ menu offers them. Each action opens the pane or
// leaves the screen, so focus moves on; a link's tab leaves it on ⋮.
export const targetRowItems = (
  row: TargetTableRow,
  onAction: (row: TargetTableRow, action: TargetAction) => void,
): RowMenuItem[] => [
  ...row.actions.map((item) => ({
    ...targetRowItem(row, item, (action) => onAction(row, action)),
    movesFocus: true,
  })),
  ...row.links.map((link) => ({ ...link, movesFocus: false })),
];
