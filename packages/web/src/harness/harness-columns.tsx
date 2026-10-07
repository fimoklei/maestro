import type { HarnessStageRow } from "@maestro/core";
import { RowItemsMenu } from "../inventory/row-menu";
import { TYPE_WORD } from "../inventory/type-filter";
import type { ActionsMenuProps } from "../ui/actions-menu";
import { createDataTableColumns } from "../ui/data-table";
import type { DataTableCardContent } from "../ui/data-table-card";
import type { Copy } from "../ui/phrase";
import { StatusBadge } from "../ui/status-badge";
import { readingRank, type StatusReading } from "../ui/status-reading";
import { ChangeCard } from "./change-card";
import { PullRequestCell } from "./pull-request-cell";
import {
  alsoInWords,
  changeSentence,
  crossStageLine,
  detailSentence,
  reviewerLine,
  STAGE_NAMES,
  type StageContext,
} from "./stage-copy";

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
const rowMenuLabel = (row: HarnessStageRow) =>
  `Actions for ${row.skill} in ${STAGE_NAMES[row.stage]}`;

// The Status cell's hover card: the row's sentences in short, and in full in
// the pane (#994). The keyboard opens this card alone, so it also says what
// the Change card says (#1399).
const statusCardContent =
  (context: StageContext, freshness: string | null) =>
  (row: HarnessTableRow): DataTableCardContent => ({
    reading: row.reading,
    body: [
      detailSentence(row, context),
      changeSentence(row, context),
      reviewerLine(row),
      crossStageLine(row),
    ].filter((line): line is Copy => line !== null),
    readAge: freshness ?? undefined,
  });

export const harnessColumns = ({
  context,
  freshness,
}: {
  context: StageContext;
  freshness: string | null;
}) =>
  createDataTableColumns<HarnessTableRow>((helper) => [
    helper.display({
      id: "type",
      header: "Type",
      // Every row is a skill today; hooks and MCP servers slot in (#347).
      cell: () => <span className="text-gray-11">{TYPE_WORD.skill}</span>,
      meta: { width: 14, priority: 1 },
    }),
    {
      ...helper.accessor("skill", { header: "Name", meta: { width: 58 } }),
      name: true,
    },
    helper.accessor("change", {
      header: "Change",
      cell: ({ row }) => <ChangeCard row={row.original} context={context} />,
      // The longest word, Addition or Deletion, fits. Hidden after Pull
      // request: the pane names the change too.
      meta: { width: 20, priority: 4 },
    }),
    {
      ...helper.accessor("reading", {
        header: "Status",
        cell: ({ row }) => <StatusBadge reading={row.original.reading} />,
        sortFn: (a, b) =>
          readingRank(a.original.reading) - readingRank(b.original.reading),
        // The longest reading, Approved, awaiting merge, fits (#994).
        meta: { width: 62 },
      }),
      card: { keyboard: true, content: statusCardContent(context, freshness) },
    },
    helper.display({
      id: "pull-request",
      header: "Pull request",
      cell: ({ row }) => <PullRequestCell row={row.original} />,
      meta: { width: 28, priority: 3 },
    }),
    helper.display({
      id: "also-in",
      header: "Also in",
      cell: ({ row }) => (
        <span className="text-gray-11">{alsoInWords(row.original)}</span>
      ),
      meta: { priority: 2 },
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
      meta: { width: 10 },
    }),
  ]);
