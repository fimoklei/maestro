import { createDataTableColumns } from "../ui/data-table";
import type { DataTableCardContent } from "../ui/data-table-card";
import { NoValue } from "../ui/no-value";
import { RowMenu } from "../ui/row-menu";
import { StatusBadge } from "../ui/status-badge";
import { readingRank, type StatusReading } from "../ui/status-reading";
import { StatusSkeleton } from "../ui/status-skeleton";
import { ACTIONS_COLUMN_LABEL, rowActionsLabel } from "./inventory-copy";
import { ReachCard } from "./reach-card";
import type { SkillDeployment } from "./skill-deployments";
import { TYPE_WORD } from "./type-filter";
import type { Primitive } from "./use-inventory";

export type RowAction = "deploy" | "remove" | "delete";

// The Inventory table's columns, and the columns Display can switch off.
export type InventoryRow = Primitive & {
  status: StatusReading | null;
  // Null while the status is unconfirmed, so a partial reach never shows.
  targets: number | null;
  /** What the hover card expands the Status and Targets cells into. */
  deployments: SkillDeployment[];
  unreadable: boolean;
  /** The hover card's footer; null where no target was compared. */
  readAge: string | null;
  /** The ⋮ menu's items, in order. */
  actions: {
    action: RowAction;
    label: string;
    danger?: boolean;
    disabled?: boolean;
  }[];
};

const unranked = Number.MAX_SAFE_INTEGER;

// The Status and Targets cells open the same card. The keyboard's row opens
// the first shown keyboard card, so Status must stay before Targets: then it
// opens the Status cell's, and the Targets cell's only while Display hides
// Status.
const reachCard = {
  keyboard: true,
  content: (row: InventoryRow): DataTableCardContent | null =>
    row.status === null
      ? null
      : {
          reading: row.status,
          body: [
            <ReachCard
              key="reach"
              count={row.targets ?? 0}
              deployments={row.deployments}
              unreadable={row.unreadable}
            />,
          ],
          readAge: row.readAge,
        },
};

export const inventoryColumns = ({
  onAction,
}: {
  onAction: (row: InventoryRow, action: RowAction) => void;
}) =>
  createDataTableColumns<InventoryRow>((helper) => [
    {
      ...helper.accessor("name", { header: "Name" }),
      name: (row) => row.name,
    },
    {
      ...helper.accessor("status", {
        header: "Status",
        cell: ({ row }) => {
          const status = row.original.status;
          return status === null ? (
            <StatusSkeleton />
          ) : (
            <StatusBadge reading={status} />
          );
        },
        sortFn: (a, b) =>
          (a.original.status ? readingRank(a.original.status) : unranked) -
          (b.original.status ? readingRank(b.original.status) : unranked),
        meta: { width: 33 },
      }),
      card: reachCard,
    },
    helper.accessor("type", {
      header: "Type",
      cell: ({ row }) => TYPE_WORD[row.original.type],
      meta: { className: "text-gray-11", width: 16, priority: 2 },
    }),
    helper.accessor("description", {
      header: "Description",
      // Drops out first on a narrow window (#992).
      meta: { className: "text-gray-11", width: 128, priority: 1 },
    }),
    {
      ...helper.accessor("targets", {
        header: "Targets",
        cell: ({ row }) => {
          const targets = row.original.targets;
          return targets === null ? null : targets === 0 ? (
            <NoValue />
          ) : (
            targets
          );
        },
        sortFn: (a, b) =>
          (a.original.targets ?? -1) - (b.original.targets ?? -1),
        meta: {
          className: "tabular-nums text-gray-12",
          width: 18,
          priority: 3,
          align: "end",
        },
      }),
      card: reachCard,
    },
    helper.display({
      id: "actions",
      header: () => <span className="sr-only">{ACTIONS_COLUMN_LABEL}</span>,
      cell: ({ row }) => (
        <RowMenu
          label={rowActionsLabel(row.original.name)}
          // Each opens the pane, which takes focus.
          items={row.original.actions.map(({ action, ...item }) => ({
            ...item,
            movesFocus: true,
            onSelect: () => onAction(row.original, action),
          }))}
          tabStop={false}
          busy={false}
        />
      ),
      meta: { width: 10 },
    }),
  ]);

export const DISPLAY_OPTIONS = [
  { value: "status", label: "Status" },
  { value: "type", label: "Type" },
  { value: "description", label: "Description" },
  { value: "targets", label: "Targets" },
];
