import { RowMenu } from "../inventory/row-menu";
import {
  createDataTableColumns,
  useDataTableRowActive,
} from "../ui/data-table";
import { HoverCard } from "../ui/hover-card";
import { MachineValue } from "../ui/machine-value";
import { StatusBadge } from "../ui/status-badge";
import { readingRank } from "../ui/status-reading";
import { useNow } from "../ui/use-now";
import { ACTIONS_COLUMN_LABEL, TARGET_LABEL } from "./deploy-state-copy";
import { statusSummary, type TargetRow } from "./target-rows";

// The Deploy-state table's columns (#993): the kind is the group, not a column.

export type TargetAction = "deploy" | "update" | "retry";

export type TargetTableRow = TargetRow & {
  /** The ⋮ menu's items, in order; the pane's foot offers the same. */
  actions: { action: TargetAction; label: string; disabled?: boolean }[];
};

const unranked = Number.MAX_SAFE_INTEGER;

// The Status cell's hover card: the badge's summary, never a control.
function StatusCard({ row }: { row: TargetTableRow }) {
  const active = useDataTableRowActive();
  const now = useNow();
  if (row.status === null) {
    return null;
  }
  const lines = statusSummary(row, now);
  return (
    <HoverCard
      focused={active}
      content={
        <div className="flex flex-col gap-inline">
          <div className="flex items-center gap-inline">
            <StatusBadge reading={row.status} />
            {row.release ? <ReleaseValue release={row.release} /> : null}
          </div>
          {lines.map((line) => (
            <p key={line} className="m-0 text-gray-11">
              {line}
            </p>
          ))}
        </div>
      }
    >
      <span className="inline-flex align-middle">
        <StatusBadge reading={row.status} />
      </span>
    </HoverCard>
  );
}

function ReleaseValue({
  release,
}: {
  release: NonNullable<TargetRow["release"]>;
}) {
  return release.latest === null || release.latest === release.current ? (
    <MachineValue>{release.current}</MachineValue>
  ) : (
    <span>
      <span className="text-gray-11">
        <MachineValue>{release.current}</MachineValue>
      </span>
      <span className="text-gray-11"> → </span>
      <MachineValue>{release.latest}</MachineValue>
    </span>
  );
}

export const deployStateColumns = ({
  onAction,
}: {
  onAction: (row: TargetTableRow, action: TargetAction) => void;
}) =>
  createDataTableColumns<TargetTableRow>((helper) => [
    helper.accessor("name", {
      header: TARGET_LABEL,
      cell: ({ row }) => (
        <span className="flex min-w-0 items-baseline gap-inline">
          <span
            title={row.original.title}
            className="flex-none font-medium text-gray-12"
          >
            {row.original.name}
          </span>
          {/* The path drops out first on a narrow window (#993). */}
          <span className="truncate text-gray-11 @max-[45rem]:hidden">
            <MachineValue>{row.original.path}</MachineValue>
          </span>
        </span>
      ),
    }),
    helper.accessor("release", {
      header: "Release",
      enableSorting: false,
      cell: ({ row }) =>
        row.original.release === null ? (
          <span className="text-gray-11">—</span>
        ) : (
          <span className="text-gray-12">
            <ReleaseValue release={row.original.release} />
          </span>
        ),
      meta: { className: "w-43" },
    }),
    helper.accessor("status", {
      header: "Status",
      cell: ({ row }) => <StatusCard row={row.original} />,
      sortFn: (a, b) =>
        (a.original.status ? readingRank(a.original.status) : unranked) -
        (b.original.status ? readingRank(b.original.status) : unranked),
      meta: { className: "w-41" },
    }),
    helper.accessor("skills", {
      header: "Skills",
      cell: ({ row }) => {
        const skills = row.original.skills;
        return skills === null ? null : skills === 0 ? (
          <span className="text-gray-11">—</span>
        ) : (
          <span className="text-gray-12">{skills}</span>
        );
      },
      sortFn: (a, b) => (a.original.skills ?? -1) - (b.original.skills ?? -1),
      meta: { className: "w-18 tabular-nums", align: "end" },
    }),
    helper.display({
      id: "actions",
      header: () => <span className="sr-only">{ACTIONS_COLUMN_LABEL}</span>,
      cell: ({ row }) => (
        <RowMenu
          name={row.original.name}
          items={row.original.actions}
          onAction={(action) => onAction(row.original, action)}
        />
      ),
      meta: { className: "w-10" },
    }),
  ]);
