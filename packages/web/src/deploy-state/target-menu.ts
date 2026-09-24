import { DEPLOY_SKILL } from "../inventory/inventory-copy";
import type { TargetTableRow } from "./deploy-state-columns";
import { RETRY_LABELS } from "./release-head-copy";
import type { TargetRow } from "./target-rows";
import {
  RETRY_UPDATE_NOT_READ,
  RETRY_UPDATE_NOTHING,
  retryRunning,
  UPDATE_TARGET,
  UPDATE_TARGET_BLOCKED,
} from "./update-target-copy";

// A Deploy-state row's ⋮ menu (#1067); a blocked item stays, with its cause.

export type MenuFacts = Pick<
  TargetRow,
  "behind" | "head" | "pinned" | "pending" | "readFailed" | "skills"
>;

const updateBlocked = (row: MenuFacts): string | null => {
  if (row.behind) return null;
  if (row.readFailed || row.skills === null)
    return UPDATE_TARGET_BLOCKED.notRead;
  if (row.pending) return UPDATE_TARGET_BLOCKED.unfinished;
  if (row.pinned) return UPDATE_TARGET_BLOCKED.pinned;
  if (!row.head) return UPDATE_TARGET_BLOCKED.empty;
  if (row.head.latestRelease === null)
    return UPDATE_TARGET_BLOCKED.latestUnknown;
  return UPDATE_TARGET_BLOCKED.onLatest;
};

const retryItem = (
  row: MenuFacts,
  retrying: boolean,
): TargetTableRow["actions"][number] => {
  if (row.pending) {
    const label = RETRY_LABELS[row.pending.kind];
    return retrying
      ? { action: "retry", label: retryRunning(label), disabled: true }
      : { action: "retry", label };
  }
  return {
    action: "retry",
    label:
      row.readFailed || row.skills === null
        ? RETRY_UPDATE_NOT_READ
        : RETRY_UPDATE_NOTHING,
    disabled: true,
  };
};

export function targetMenuItems(
  row: MenuFacts,
  retrying: boolean,
): TargetTableRow["actions"] {
  const blocked = updateBlocked(row);
  return [
    { action: "deploy", label: DEPLOY_SKILL },
    blocked === null
      ? { action: "update", label: UPDATE_TARGET }
      : { action: "update", label: blocked, disabled: true },
    retryItem(row, retrying),
  ];
}
