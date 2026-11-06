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
        // The path gives way first, so the note's copy count stays in view.
        <span className="flex min-w-0 items-baseline gap-x-1 pl-6">
          <span className="min-w-0 truncate">
            <MachineValue>{folder.path}</MachineValue>
          </span>
          {folder.note === null ? null : (
            <span className="shrink-0 whitespace-nowrap">{folder.note}</span>
          )}
        </span>
      ),
      status:
        folder.status === null ? null : <StatusMark reading={folder.status} />,
    },
  }));
}
