import type { FootItem } from "../ui/foot-actions";
import type { TargetAction, TargetTableRow } from "./deploy-state-columns";
import { GLOBAL } from "./deploy-state-copy";
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

// A repository whose read failed states that failure, never its stale record.
export const showsReadFailure = (
  row: Pick<TargetRow, "readFailed" | "group">,
) => row.readFailed && row.group !== GLOBAL;

// The ⋮ items for the pane's foot, Update target and Import local edits named
// as the next step, except while an unfinished operation stands (#1272).
export function targetPaneActions<Row extends PaneRow>(
  row: Row,
  onAction: (row: Row, action: TargetAction) => void,
): FootItem[] {
  return (
    row.actions
      // The retry sits in the unfinished operation's notice.
      .filter((entry) => entry.action !== "retry")
      .map((entry) => {
        const placed = targetRowItem(row, entry, (action) =>
          onAction(row, action),
        );
        return !row.pending &&
          (entry.action === "update" || entry.action === "import")
          ? { ...placed, step: entry.action }
          : placed;
      })
  );
}
