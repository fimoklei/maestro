import type { FootItem } from "../ui/foot-actions";
import type { TargetAction, TargetTableRow } from "./deploy-state-columns";
import { GLOBAL } from "./deploy-state-copy";
import { latestReleaseFact } from "./release-head-copy";
import { targetRowItem } from "./target-menu";
import type { TargetRow } from "./target-rows";

export type PaneRow = Pick<
  TargetTableRow,
  | "actions"
  | "name"
  | "updateName"
  | "head"
  | "pending"
  | "readFailed"
  | "group"
>;

// A repository whose read failed withholds its stale unfinished notice, so its
// retry stays at the foot.
export const showsReadFailure = (
  row: Pick<TargetRow, "readFailed" | "group">,
) => row.readFailed && row.group !== GLOBAL;

export type TargetPaneActions = {
  /** Update target beside the Latest release fact; null where it has no such fact. */
  update: FootItem | null;
  foot: FootItem[];
};

// Each ⋮ item where its reason is, Update target and Import local edits named
// as the next step, except while an unfinished operation stands (#1272).
export function targetPaneActions<Row extends PaneRow>(
  row: Row,
  onAction: (row: Row, action: TargetAction) => void,
): TargetPaneActions {
  const item = (entry: TargetTableRow["actions"][number]): FootItem => {
    const placed = targetRowItem(row, entry, (action) => onAction(row, action));
    return !row.pending &&
      (entry.action === "update" || entry.action === "import")
      ? { ...placed, step: entry.action }
      : placed;
  };
  const update = row.actions.find((entry) => entry.action === "update");
  const beside = latestReleaseFact(row.head) === null ? undefined : update;
  const retryAtFoot = showsReadFailure(row);
  return {
    update: beside ? item(beside) : null,
    foot: row.actions
      .filter(
        (entry) =>
          (retryAtFoot || entry.action !== "retry") && entry !== beside,
      )
      .map(item),
  };
}
