import { createDataTableColumns } from "../ui/data-table";
import type { DataTableCardContent } from "../ui/data-table-card";
import { githubColumn } from "../ui/github-column";
import { MachineValue } from "../ui/machine-value";
import { NoValue } from "../ui/no-value";
import { RowMenu } from "../ui/row-menu";
import { ACTIONS_COLUMN_LABEL, rowActionsLabel } from "../ui/row-menu-copy";
import { StatusBadge } from "../ui/status-badge";
import { readingRank } from "../ui/status-reading";
import { StatusSkeleton } from "../ui/status-skeleton";
import { ORIGIN_NOT_READ, TARGET_LABEL } from "./deploy-state-copy";
import { targetRowItems } from "./target-menu";
import { statusCard, type TargetRow } from "./target-rows";

export type TargetAction = "deploy" | "update" | "retry" | "import";

export type TargetTableRow = TargetRow & {
  /** The ⋮ menu's items, in order; the pane's foot offers the same. */
  actions: { action: TargetAction; label: string; disabled?: boolean }[];
  /** Pages elsewhere, after the actions in the menu and at the foot. */
  links: { label: string; href: string }[];
  /** Its retry is running. */
  busy: boolean;
  /** Band 2's line, which the Status card's read age repeats. */
  compared: string | null;
};

const unranked = Number.MAX_SAFE_INTEGER;

function statusCardContent(row: TargetTableRow): DataTableCardContent | null {
  if (row.status === null) return null;
  const { reason, readAge } = statusCard(row, row.compared);
  return {
    reading: row.status,
    value: row.release ? <ReleaseValue release={row.release} /> : null,
    // The keyboard opens this card alone, so it also says what the GitHub
    // column's Unknown card says.
    body: [
      ...(reason ? [reason] : []),
      ...(row.github?.kind === "unknown" ? [ORIGIN_NOT_READ] : []),
    ],
    readAge,
  };
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
      <span aria-hidden="true" className="text-gray-11">
        {" "}
        →{" "}
      </span>
      <span className="sr-only">to </span>
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
    {
      // The name only; the path is a fact in the detail pane (#1180).
      ...helper.accessor("name", { header: TARGET_LABEL }),
      name: (row) => row.name,
    },
    {
      ...helper.accessor("status", {
        header: "Status",
        cell: ({ row }) =>
          row.original.status === null ? (
            <StatusSkeleton />
          ) : (
            <StatusBadge reading={row.original.status} />
          ),
        sortFn: (a, b) =>
          (a.original.status ? readingRank(a.original.status) : unranked) -
          (b.original.status ? readingRank(b.original.status) : unranked),
        meta: { width: 41 },
      }),
      card: { keyboard: true, content: statusCardContent },
    },
    helper.accessor("release", {
      header: "Release",
      enableSorting: false,
      cell: ({ row }) =>
        row.original.release === null ? (
          <NoValue />
        ) : (
          <span className="text-gray-12">
            <ReleaseValue release={row.original.release} />
          </span>
        ),
      meta: { width: 43, priority: 3 },
    }),
    helper.accessor("skills", {
      header: "Skills",
      cell: ({ row }) => {
        const skills = row.original.skills;
        return skills === null ? null : skills === 0 ? (
          <NoValue />
        ) : (
          <span className="text-gray-12">{skills}</span>
        );
      },
      sortFn: (a, b) => (a.original.skills ?? -1) - (b.original.skills ?? -1),
      meta: { className: "tabular-nums", width: 18, priority: 2, align: "end" },
    }),
    githubColumn<TargetTableRow>("Deploy-state"),
    helper.display({
      id: "actions",
      header: () => <span className="sr-only">{ACTIONS_COLUMN_LABEL}</span>,
      cell: ({ row }) => (
        <RowMenu
          label={rowActionsLabel(row.original.name)}
          items={targetRowItems(row.original, onAction)}
          tabStop={false}
          busy={row.original.busy}
        />
      ),
      meta: { width: 10 },
    }),
  ]);
