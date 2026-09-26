import { RowItemsMenu } from "../inventory/row-menu";
import { TYPE_WORD } from "../inventory/type-filter";
import type { ActionsMenuProps } from "../ui/actions-menu";
import {
  createDataTableColumns,
  useDataTableRowActive,
} from "../ui/data-table";
import { HoverCard } from "../ui/hover-card";
import { StatusBadge } from "../ui/status-badge";
import { readingRank, type StatusReading } from "../ui/status-reading";
import { PullRequestCell } from "./pull-request-cell";
import {
  alsoInWords,
  crossStageLine,
  detailSentence,
  reviewerLine,
  STAGE_NAMES,
  type StageContext,
} from "./stage-copy";
import type { HarnessStageRow } from "./use-harness";

// One row of the Harness table (#994). A skill can hold a row in every stage,
// so its name alone names up to three rows: the id carries the stage too.
export type HarnessTableRow = HarnessStageRow & {
  id: string;
  group: string;
  reading: StatusReading;
  items: ActionsMenuProps["items"];
};

export const rowId = (row: Pick<HarnessStageRow, "stage" | "skill">) =>
  `${row.stage}:${row.skill}`;

// The ⋮ trigger is named by its stage too: three menus called "Actions for
// tdd" would name the same thing three times.
export const rowMenuLabel = (row: HarnessStageRow) =>
  `Actions for ${row.skill} in ${STAGE_NAMES[row.stage]}`;

// The Status cell's hover card: the row's sentences in short, and in full in
// the pane (#994). Never a control.
function StatusCard({
  row,
  context,
  freshness,
}: {
  row: HarnessTableRow;
  context: StageContext;
  freshness: string;
}) {
  const active = useDataTableRowActive();
  const lines = [
    detailSentence(row, context),
    reviewerLine(row),
    crossStageLine(row),
  ].filter((line): line is string => line !== null);
  return (
    <HoverCard
      focused={active}
      content={
        <div className="flex flex-col gap-inline">
          <span className="inline-flex">
            <StatusBadge reading={row.reading} />
          </span>
          {lines.map((line) => (
            <p key={line} className="m-0 text-gray-12">
              {line}
            </p>
          ))}
          <p className="m-0 border-divider border-t pt-inline text-gray-11">
            {freshness}
          </p>
        </div>
      }
    >
      <span className="inline-flex align-middle">
        <StatusBadge reading={row.reading} />
      </span>
    </HoverCard>
  );
}

export const harnessColumns = ({
  context,
  freshness,
}: {
  context: StageContext;
  freshness: string;
}) =>
  createDataTableColumns<HarnessTableRow>((helper) => [
    helper.display({
      id: "type",
      header: "Type",
      // Every row is a skill today; hooks and MCP servers slot in (#347).
      cell: () => <span className="text-gray-11">{TYPE_WORD.skill}</span>,
      meta: { className: "w-14" },
    }),
    helper.accessor("skill", {
      header: "Name",
      cell: ({ row }) => (
        <span title={row.original.skill} className="font-medium text-gray-12">
          {row.original.skill}
        </span>
      ),
      meta: { className: "w-58" },
    }),
    helper.accessor("reading", {
      header: "Status",
      cell: ({ row }) => (
        <StatusCard
          row={row.original}
          context={context}
          freshness={freshness}
        />
      ),
      sortFn: (a, b) =>
        readingRank(a.original.reading) - readingRank(b.original.reading),
      // The longest reading, Deletion approved, awaiting merge, fits (#994).
      meta: { className: "w-62" },
    }),
    helper.display({
      id: "pull-request",
      header: "Pull request",
      cell: ({ row }) => <PullRequestCell row={row.original} />,
      meta: { className: "w-28" },
    }),
    helper.display({
      id: "also-in",
      header: "Also in",
      cell: ({ row }) => (
        <span className="text-gray-11">{alsoInWords(row.original)}</span>
      ),
    }),
    helper.display({
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <RowItemsMenu
          label={rowMenuLabel(row.original)}
          items={row.original.items}
        />
      ),
      meta: { className: "w-10" },
    }),
  ]);
