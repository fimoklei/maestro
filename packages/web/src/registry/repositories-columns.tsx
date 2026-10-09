// biome-ignore-all lint/plugin/no-title-in-table-cell: Repositories has no declared name cell yet; #1433 left it out of scope, so its native title stays.

import type { GitHubPage } from "@maestro/core";
import { VIEW_DEPLOY_STATE } from "../ui/control-labels";
import { createDataTableColumns } from "../ui/data-table";
import { githubColumn } from "../ui/github-column";
import { VIEW_REPOSITORY_ON_GITHUB } from "../ui/github-link-copy";
import { MachineValue } from "../ui/machine-value";
import { RowMenu } from "../ui/row-menu";
import { ACTIONS_COLUMN_LABEL, rowActionsLabel } from "../ui/row-menu-copy";
import { StatusBadge } from "../ui/status-badge";
import { readingRank, type StatusReading } from "../ui/status-reading";
import { COLUMNS, SCREEN, UNREGISTER } from "./repositories-copy";

// The Repositories table (#1009): what the registry itself knows, plus the
// GitHub page the repository's deploy-state read names (#1456).

export type RepositoryAction = "view" | "unregister";

export type RepositoryRow = {
  path: string;
  /** The shortest unique label, as every screen names a repository. */
  name: string;
  status: StatusReading;
  /** Undefined where the repository has no page on GitHub, or is not read yet. */
  github: GitHubPage | undefined;
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
    githubColumn<RepositoryRow>(SCREEN),
    helper.display({
      id: "actions",
      header: () => <span className="sr-only">{ACTIONS_COLUMN_LABEL}</span>,
      cell: ({ row }) => (
        <RowMenu
          label={rowActionsLabel(row.original.name)}
          items={[
            {
              label: VIEW_DEPLOY_STATE,
              onSelect: () => onAction(row.original, "view"),
              movesFocus: true,
            },
            ...(row.original.github?.kind === "link"
              ? [
                  {
                    label: VIEW_REPOSITORY_ON_GITHUB,
                    href: row.original.github.url,
                    movesFocus: false,
                  },
                ]
              : []),
            {
              label: UNREGISTER,
              danger: true,
              onSelect: () => onAction(row.original, "unregister"),
              movesFocus: false,
            },
          ]}
          tabStop={false}
          busy={false}
        />
      ),
      meta: { width: 10 },
    }),
  ]);
