import type { ReactNode } from "react";
import {
  createDataTableColumns,
  useDataTableRowActive,
} from "../ui/data-table";
import { HoverCard } from "../ui/hover-card";
import { StatusBadge } from "../ui/status-badge";
import { readingRank, type StatusReading } from "../ui/status-reading";
import { ACTIONS_COLUMN_LABEL, NOT_READ_YET } from "./inventory-copy";
import { ReachCard } from "./reach-card";
import { type RowAction, RowMenu } from "./row-menu";
import type { SkillDeployment } from "./skill-deployments";
import { BEHIND, NOT_DEPLOYED, UNKNOWN, UP_TO_DATE } from "./skill-status";
import { TYPE_LABEL, TYPE_WORD } from "./type-filter";
import type { Primitive } from "./use-inventory";

// The Inventory table's columns, and the Filter and Display options over them.
export type InventoryRow = Primitive & {
  status: StatusReading | null;
  // Null while the status is unconfirmed, so a partial reach never shows.
  targets: number | null;
  /** What the hover card expands the Status and Targets cells into. */
  deployments: SkillDeployment[];
  unreadable: boolean;
  /** The ⋮ menu's items, in order. */
  actions: { action: RowAction; label: string }[];
};

const unranked = Number.MAX_SAFE_INTEGER;

// The hover card over a cell. The row the keyboard is on opens one card only:
// the Status cell's, or the Targets cell's while Display hides Status.
function Reach({
  row,
  keyboard,
  children,
}: {
  row: InventoryRow;
  keyboard: boolean;
  children: ReactNode;
}) {
  const active = useDataTableRowActive();
  return (
    <HoverCard
      focused={keyboard && active}
      content={
        <ReachCard
          count={row.targets ?? 0}
          deployments={row.deployments}
          unreadable={row.unreadable}
        />
      }
    >
      <span className="inline-flex align-middle">{children}</span>
    </HoverCard>
  );
}

export const inventoryColumns = ({
  cardColumn,
  onAction,
}: {
  cardColumn: "status" | "targets";
  onAction: (row: InventoryRow, action: RowAction) => void;
}) =>
  createDataTableColumns<InventoryRow>((helper) => [
    helper.accessor("type", {
      header: "Type",
      cell: ({ row }) => TYPE_WORD[row.original.type],
      meta: { className: "w-16 text-gray-11" },
    }),
    helper.accessor("name", {
      header: "Name",
      meta: { className: "w-55 font-medium text-gray-12" },
    }),
    helper.accessor("description", {
      header: "Description",
      // Drops out first on a narrow window (#992).
      meta: { className: "text-gray-11 @max-[45rem]:hidden" },
    }),
    helper.accessor("status", {
      header: "Status",
      cell: ({ row }) => {
        const status = row.original.status;
        return status === null ? null : (
          <Reach row={row.original} keyboard={cardColumn === "status"}>
            <StatusBadge reading={status} />
          </Reach>
        );
      },
      sortFn: (a, b) =>
        (a.original.status ? readingRank(a.original.status) : unranked) -
        (b.original.status ? readingRank(b.original.status) : unranked),
      meta: { className: "w-33" },
    }),
    helper.accessor("targets", {
      header: "Targets",
      cell: ({ row }) => {
        const targets = row.original.targets;
        return targets === null ? null : (
          <Reach row={row.original} keyboard={cardColumn === "targets"}>
            {targets === 0 ? "—" : targets}
          </Reach>
        );
      },
      sortFn: (a, b) => (a.original.targets ?? -1) - (b.original.targets ?? -1),
      meta: { className: "w-18 tabular-nums text-gray-12", align: "end" },
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

export const STATUS_OPTIONS = [UP_TO_DATE, BEHIND, UNKNOWN, NOT_DEPLOYED].map(
  (reading) => ({ value: reading.word, label: reading.word }),
);

export type Grouping = "none" | "type" | "status";

export const GROUP_OPTIONS = [
  { value: "none", label: "None" },
  { value: "type", label: "Type" },
  { value: "status", label: "Status" },
];

// Worst first, as the Status sort orders them (#992).
const STATUS_GROUP_ORDER = [BEHIND, UNKNOWN, UP_TO_DATE, NOT_DEPLOYED].map(
  (reading) => reading.word,
);

export function groupsFor(grouping: Grouping) {
  if (grouping === "type") {
    return { key: (row: InventoryRow) => TYPE_LABEL[row.type] };
  }
  if (grouping === "status") {
    return {
      key: (row: InventoryRow) => row.status?.word ?? NOT_READ_YET,
      order: STATUS_GROUP_ORDER,
    };
  }
  return undefined;
}

export const DISPLAY_OPTIONS = [
  { value: "type", label: "Type" },
  { value: "description", label: "Description" },
  { value: "status", label: "Status" },
  { value: "targets", label: "Targets" },
];
