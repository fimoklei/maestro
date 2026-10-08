// biome-ignore-all lint/plugin/no-title-in-table-cell: Repositories has no declared name cell yet; #1433 left it out of scope, so its native title stays.
import type { GitHubPage } from "@maestro/core";
import { VIEW_REPOSITORY_ON_GITHUB } from "../deploy-state/deploy-state-copy";
import { rowActionsLabel } from "../inventory/inventory-copy";
import { RowItemsMenu } from "../inventory/row-menu";
import { createDataTableColumns } from "../ui/data-table";
import { GITHUB_COLUMN } from "../ui/github-link-copy";
import { GITHUB_UNKNOWN, GitHubMarkLink } from "../ui/github-mark-link";
import { MachineValue } from "../ui/machine-value";
import { StatusBadge } from "../ui/status-badge";
import { readingRank, type StatusReading } from "../ui/status-reading";
import {
  ACTIONS_COLUMN_LABEL,
  COLUMNS,
  ORIGIN_NOT_READ,
  UNREGISTER,
  VIEW_DEPLOY_STATE,
} from "./repositories-copy";

// The Repositories table (#1009): what the registry itself knows, plus the
// GitHub page the repository's deploy-state read names (#1456).

export type RepositoryAction = "view" | "unregister";

export type RepositoryRow = {
  path: string;
  /** The shortest unique label, as every screen names a repository. */
  name: string;
  status: StatusReading;
  /** Absent where the repository has no page on GitHub, or is not read yet. */
  github?: GitHubPage;
};

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
    }),
    helper.accessor("status", {
      header: COLUMNS.status,
      cell: ({ row }) => <StatusBadge reading={row.original.status} />,
      sortFn: (a, b) =>
        readingRank(a.original.status) - readingRank(b.original.status),
      meta: { width: 50 },
    }),
    helper.accessor("path", {
      header: COLUMNS.path,
      cell: ({ row }) => (
        <span title={row.original.path} className="text-gray-11">
          <MachineValue>{row.original.path}</MachineValue>
        </span>
      ),
      // Drops out on a narrow window; the label's title keeps it.
      meta: { width: 96, priority: 2 },
    }),
    {
      ...helper.display({
        id: "github",
        header: GITHUB_COLUMN,
        cell: ({ row }) =>
          row.original.github?.kind === "unknown" ? (
            <StatusBadge reading={GITHUB_UNKNOWN} />
          ) : (
            <GitHubMarkLink
              page={row.original.github}
              name={row.original.name}
            />
          ),
        // Drops out first on a narrow panel; the ⋮ menu keeps the same link.
        meta: { width: 28, priority: 1 },
      }),
      card: {
        keyboard: false,
        content: (row) =>
          row.github?.kind === "unknown"
            ? { body: [ORIGIN_NOT_READ], readAge: null }
            : null,
      },
    },
    helper.display({
      id: "actions",
      header: () => <span className="sr-only">{ACTIONS_COLUMN_LABEL}</span>,
      cell: ({ row }) => (
        <RowItemsMenu
          label={rowActionsLabel(row.original.name)}
          items={[
            {
              label: VIEW_DEPLOY_STATE,
              onSelect: () => onAction(row.original, "view"),
            },
            ...(row.original.github?.kind === "link"
              ? [
                  {
                    label: VIEW_REPOSITORY_ON_GITHUB,
                    href: row.original.github.url,
                  },
                ]
              : []),
            {
              label: UNREGISTER,
              danger: true,
              onSelect: () => onAction(row.original, "unregister"),
            },
          ]}
        />
      ),
      meta: { width: 10 },
    }),
  ]);
