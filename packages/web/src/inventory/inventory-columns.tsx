import { createDataTableColumns } from "../ui/data-table";
import { StatusBadge } from "../ui/status-badge";
import { readingRank, type StatusReading } from "../ui/status-reading";
import { NOT_READ_YET } from "./inventory-copy";
import { BEHIND, NOT_DEPLOYED, UNKNOWN, UP_TO_DATE } from "./skill-status";
import { TYPE_LABEL, TYPE_WORD } from "./type-filter";
import type { Primitive } from "./use-inventory";

// The Inventory table's columns, and the Filter and Display options over them.
export type InventoryRow = Primitive & {
  status: StatusReading | null;
  // Null while the status is unconfirmed, so a partial reach never shows.
  targets: number | null;
};

const unranked = Number.MAX_SAFE_INTEGER;

export const columns = createDataTableColumns<InventoryRow>((helper) => [
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
    cell: ({ getValue }) => {
      const status = getValue();
      return status === null ? null : <StatusBadge reading={status} />;
    },
    sortFn: (a, b) =>
      (a.original.status ? readingRank(a.original.status) : unranked) -
      (b.original.status ? readingRank(b.original.status) : unranked),
    meta: { className: "w-33" },
  }),
  helper.accessor("targets", {
    header: "Targets",
    cell: ({ getValue }) => {
      const targets = getValue();
      return targets === null ? null : targets === 0 ? "—" : targets;
    },
    sortFn: (a, b) => (a.original.targets ?? -1) - (b.original.targets ?? -1),
    meta: { className: "w-18 tabular-nums text-gray-12", align: "end" },
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
