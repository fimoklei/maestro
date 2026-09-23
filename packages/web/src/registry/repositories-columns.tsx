import { RowMenu } from "../inventory/row-menu";
import { createDataTableColumns } from "../ui/data-table";
import { MachineValue } from "../ui/machine-value";
import { StatusBadge } from "../ui/status-badge";
import { readingRank, type StatusReading } from "../ui/status-reading";
import {
  ACTIONS_COLUMN_LABEL,
  COLUMNS,
  UNREGISTER,
  VIEW_DEPLOY_STATE,
} from "./repositories-copy";

// The Repositories table (#1009): what the registry itself knows, nothing
// that needs a deploy-state read.

export type RepositoryAction = "view" | "unregister";

export type RepositoryRow = {
  path: string;
  /** The shortest unique label, as every screen names a repository. */
  name: string;
  status: StatusReading;
};

const ITEMS = [
  { action: "view" as const, label: VIEW_DEPLOY_STATE },
  { action: "unregister" as const, label: UNREGISTER, danger: true },
];

export const repositoriesColumns = ({
  onAction,
}: {
  onAction: (row: RepositoryRow, action: RepositoryAction) => void;
}) =>
  createDataTableColumns<RepositoryRow>((helper) => [
    helper.accessor("name", {
      header: COLUMNS.repository,
      cell: ({ row }) => (
        <span title={row.original.path} className="font-medium text-gray-12">
          {row.original.name}
        </span>
      ),
      meta: { className: "w-55" },
    }),
    helper.accessor("path", {
      header: COLUMNS.path,
      cell: ({ row }) => (
        <span title={row.original.path} className="text-gray-11">
          <MachineValue>{row.original.path}</MachineValue>
        </span>
      ),
      // The path drops out first on a narrow window; the label's title keeps it.
      meta: { className: "@max-[30rem]:hidden" },
    }),
    helper.accessor("status", {
      header: COLUMNS.status,
      cell: ({ row }) => <StatusBadge reading={row.original.status} />,
      sortFn: (a, b) =>
        readingRank(a.original.status) - readingRank(b.original.status),
      meta: { className: "w-50" },
    }),
    helper.display({
      id: "actions",
      header: () => <span className="sr-only">{ACTIONS_COLUMN_LABEL}</span>,
      cell: ({ row }) => (
        <RowMenu
          name={row.original.name}
          items={ITEMS}
          onAction={(action) => onAction(row.original, action)}
        />
      ),
      meta: { className: "w-10" },
    }),
  ]);
