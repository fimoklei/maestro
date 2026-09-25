import { DEPLOY_SKILL } from "../inventory/inventory-copy";
import type { TargetTableRow } from "./deploy-state-columns";
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
