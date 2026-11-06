import type { DataTableSubRow } from "../ui/data-table-sub-row";
import { MachineValue } from "../ui/machine-value";
import { StatusMark } from "../ui/status-mark";
import type { TargetRow } from "./target-rows";

/** Global's folders under its row: the path and one mark, read-only. */
export function folderSubRows(
  row: Pick<TargetRow, "id" | "folders">,
): DataTableSubRow[] {
  return (row.folders ?? []).map((folder) => ({
    id: `${row.id}:${folder.path}`,
    muted: !folder.detected,
    cells: {
      name: (
        // Indented under its target's name.
        <span className="block truncate pl-6">
          <MachineValue>{folder.path}</MachineValue>
          {folder.note === null ? null : <> {folder.note}</>}
        </span>
      ),
      status:
        folder.status === null ? null : <StatusMark reading={folder.status} />,
    },
  }));
}
