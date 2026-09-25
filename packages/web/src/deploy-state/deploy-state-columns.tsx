import { rowActionsLabel } from "../inventory/inventory-copy";
import { RowItemsMenu } from "../inventory/row-menu";
import {
  createDataTableColumns,
  useDataTableRowActive,
} from "../ui/data-table";
import { GITHUB_COLUMN } from "../ui/github-link-copy";
import { GitHubMarkLink } from "../ui/github-mark-link";
import { HoverCard } from "../ui/hover-card";
import { MachineValue } from "../ui/machine-value";
import { StatusBadge } from "../ui/status-badge";
import { readingRank } from "../ui/status-reading";
import { useNow } from "../ui/use-now";
import {
  ACTIONS_COLUMN_LABEL,
  ORIGIN_NOT_READ,
  TARGET_LABEL,
} from "./deploy-state-copy";
import { targetRowItems } from "./target-menu";
import { statusSummary, type TargetRow } from "./target-rows";

export type TargetAction = "deploy" | "update" | "retry";

export type TargetTableRow = TargetRow & {
  /** The ⋮ menu's items, in order; the pane's foot offers the same. */
  actions: { action: TargetAction; label: string; disabled?: boolean }[];
  /** Pages elsewhere, after the actions in the menu and at the foot. */
  links: { label: string; href: string }[];
};

const unranked = Number.MAX_SAFE_INTEGER;

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

// The GitHub cell: its Unknown card opens with the active row, as Status does.
function GitHubCell({ row }: { row: TargetTableRow }) {
  const active = useDataTableRowActive();
  return (
    <GitHubMarkLink
      page={row.github}
      name={row.name}
      unknownCause={ORIGIN_NOT_READ}
      focused={active}
    />
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
      // The name only; the path is a fact in the detail pane (#1180).
      cell: ({ row }) => (
        <span
          title={row.original.title}
          className="block truncate font-medium text-gray-12"
        >
          {row.original.name}
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
      id: "github",
      header: GITHUB_COLUMN,
      cell: ({ row }) => <GitHubCell row={row.original} />,
      // Drops out on a narrow panel; the ⋮ menu keeps the same link.
      meta: { className: "w-28 @max-[40rem]:hidden" },
    }),
    helper.display({
      id: "actions",
      header: () => <span className="sr-only">{ACTIONS_COLUMN_LABEL}</span>,
      cell: ({ row }) => (
        <RowItemsMenu
          label={rowActionsLabel(row.original.name)}
          items={targetRowItems(row.original, onAction)}
        />
      ),
      meta: { className: "w-10" },
    }),
  ]);
