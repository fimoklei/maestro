import { createDataTableColumns, DataTable } from "../ui/data-table";
import { MachineValue } from "../ui/machine-value";
import type { PendingSkillMovement, SkillMovementKind } from "./use-harness";

// "Deleted", never "Removed": remove belongs to deployed copies alone.
const KINDS: Record<SkillMovementKind, string> = {
  added: "Added",
  changed: "Changed",
  renamed: "Renamed",
  removed: "Deleted",
};

const columns = createDataTableColumns<PendingSkillMovement>((helper) => [
  helper.accessor("name", {
    header: "Skill",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="text-gray-12">
        <MachineValue>
          {row.original.previousName === undefined
            ? row.original.name
            : `${row.original.previousName} → ${row.original.name}`}
        </MachineValue>
      </span>
    ),
  }),
  helper.accessor("author", {
    header: "Author",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="text-gray-11">{row.original.author ?? "Unknown"}</span>
    ),
    meta: { className: "w-1/3" },
  }),
]);

export function ReleaseDelta({
  movements,
}: {
  movements: PendingSkillMovement[];
}) {
  return (
    <section className="flex flex-col gap-inline">
      <h3 className="m-0 font-medium text-gray-12 text-row">
        Pending release{" "}
        <span className="text-gray-11 tabular-nums">{movements.length}</span>
      </h3>
      <div className="overflow-hidden rounded-control border border-gray-7">
        <DataTable
          label="Pending release table"
          columns={columns}
          data={movements}
          getRowId={(movement) => `${movement.kind}:${movement.name}`}
          groups={{
            key: (movement) => KINDS[movement.kind],
            order: Object.values(KINDS),
          }}
        />
      </div>
    </section>
  );
}
