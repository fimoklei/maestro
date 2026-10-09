import { rowActionsLabel } from "../inventory/inventory-copy";
import { createDataTableColumns } from "../ui/data-table";
import type { DataTableCardContent } from "../ui/data-table-card";
import { GITHUB_COLUMN } from "../ui/github-link-copy";
import { GITHUB_UNKNOWN, GitHubMarkLink } from "../ui/github-mark-link";
import { MachineValue } from "../ui/machine-value";
import { RowMenu } from "../ui/row-menu";
import { Skeleton } from "../ui/skeleton";
import { StatusBadge } from "../ui/status-badge";
import { readingRank } from "../ui/status-reading";
import { useReadSkeleton } from "../ui/use-read-skeleton";
import {
  ACTIONS_COLUMN_LABEL,
  ORIGIN_NOT_READ,
  TARGET_LABEL,
} from "./deploy-state-copy";
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
};

const unranked = Number.MAX_SAFE_INTEGER;

// The drift check is slow; past 1.3 s its cell shows a placeholder (design.md).
function StatusReading() {
  const { visible } = useReadSkeleton(true);
  return (
    <span aria-busy="true" className="block">
      {visible ? <Skeleton className="w-16" /> : null}
    </span>
  );
}

function statusCardContent(
  row: TargetTableRow,
  now: Date,
): DataTableCardContent | null {
  if (row.status === null) return null;
  const { reason, readAge } = statusCard(row, now);
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
            <StatusReading />
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
          <span className="text-gray-11">—</span>
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
          <span className="text-gray-11">—</span>
        ) : (
          <span className="text-gray-12">{skills}</span>
        );
      },
      sortFn: (a, b) => (a.original.skills ?? -1) - (b.original.skills ?? -1),
      meta: { className: "tabular-nums", width: 18, priority: 2, align: "end" },
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
      // Pointer only: the Status card carries the same cause.
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
