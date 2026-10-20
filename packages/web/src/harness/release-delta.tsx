import type { HarnessMovementKind, PendingMovement } from "@maestro/core";
import { createDataTableColumns, DataTable } from "../ui/data-table";
import { MachineValue } from "../ui/machine-value";
import { SubListHeading } from "../ui/sub-list-heading";

// "Deleted", never "Removed": remove belongs to deployed copies alone.
const KINDS: Record<HarnessMovementKind, string> = {
  added: "Added",
  changed: "Changed",
  renamed: "Renamed",
  removed: "Deleted",
};

const columns = createDataTableColumns<PendingMovement>((helper) => [
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

export function ReleaseDelta({ movements }: { movements: PendingMovement[] }) {
  return (
    <section className="flex flex-col gap-inline">
      <SubListHeading
        label="Pending release"
        count={movements.length}
        headingRef={null}
      />
      <div className="overflow-hidden rounded-control border border-edge">
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
