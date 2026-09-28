import type { FootItem } from "../ui/foot-actions";
import type { TargetAction, TargetTableRow } from "./deploy-state-columns";
import { GLOBAL } from "./deploy-state-copy";
import { latestReleaseFact } from "./release-head-copy";
import { targetRowItem } from "./target-menu";
import type { TargetRow } from "./target-rows";

export type PaneRow = Pick<
  TargetTableRow,
  "actions" | "updateName" | "head" | "pending" | "readFailed" | "group"
>;

// A repository's failed read takes the notice, so no retry shows there.
export const showsReadFailure = (
  row: Pick<TargetRow, "readFailed" | "group">,
) => row.readFailed && row.group !== GLOBAL;

export type TargetPaneActions = {
  /** Update target beside the Latest release fact; null where it has no such fact. */
  update: (FootItem & { primary: boolean }) | null;
  foot: FootItem[];
  footPrimary: string | null;
};

// Each ⋮ item where its reason is, and the one primary chosen by the first
// state the pane names: an unfinished operation (its notice's retry), behind
// (Update target), local edits (Import local edits…), else none (#1272).
export function targetPaneActions<Row extends PaneRow>(
  row: Row,
  onAction: (row: Row, action: TargetAction) => void,
): TargetPaneActions {
  const item = (entry: TargetTableRow["actions"][number]) =>
    targetRowItem(row, entry, (action) => onAction(row, action));
  const find = (action: TargetAction) =>
    row.actions.find((entry) => entry.action === action);
  const update = find("update");
  const beside = latestReleaseFact(row.head) === null ? undefined : update;
  const retryAtFoot = showsReadFailure(row);
  const lead = row.pending ? undefined : (update ?? find("import"));
  return {
    update: beside ? { ...item(beside), primary: lead === beside } : null,
    foot: row.actions
      .filter(
        (entry) =>
          (retryAtFoot || entry.action !== "retry") && entry !== beside,
      )
      .map(item),
    footPrimary: lead === undefined || lead === beside ? null : lead.label,
  };
}
