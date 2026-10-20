import type { HarnessStageRow } from "@maestro/core";
import { TYPE_WORD } from "../inventory/type-filter";
import { createDataTableColumns } from "../ui/data-table";
import type { DataTableCardContent } from "../ui/data-table-card";
import type { FootItem } from "../ui/foot-actions";
import type { Copy } from "../ui/phrase";
import { RowMenu } from "../ui/row-menu";
import { ACTIONS_COLUMN_ID } from "../ui/row-menu-control";
import { StatusBadge } from "../ui/status-badge";
import { readingRank, type StatusReading } from "../ui/status-reading";
import { CHANGE_WORD } from "./change-words";
import { ITEM_WORDS } from "./item-words";
import { pullRequestCard } from "./pull-request-card";
import { PullRequestLinks } from "./pull-request-links";
import {
  alsoInWords,
  changeSentence,
  crossStageLine,
  detailSentence,
  reviewerLine,
  STAGE_NAMES,
  type StageContext,
} from "./stage-copy";

// One row of the Harness table (#994). A primitive can hold a row in every
// stage, and a skill and a prompt can share a name: the id carries both.
export type HarnessTableRow = HarnessStageRow & {
  id: string;
  group: string;
  reading: StatusReading;
  items: FootItem[];
};

export const rowId = (row: Pick<HarnessStageRow, "stage" | "type" | "name">) =>
  `${row.stage}:${row.type}:${row.name}`;

// The ⋮ trigger is named by its type and stage too: a skill and a prompt
// called tdd, in three stages, would otherwise share one name.
const rowMenuLabel = (row: HarnessStageRow) =>
  `Actions for ${row.name} ${ITEM_WORDS[row.type].noun} in ${STAGE_NAMES[row.stage]}`;

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
    readAge: freshness,
  });

export const harnessColumns = ({
  context,
  freshness,
}: {
  context: StageContext;
  freshness: string | null;
}) =>
  createDataTableColumns<HarnessTableRow>((helper) => [
    {
      ...helper.accessor("name", { header: "Name" }),
      name: (row) => row.name,
    },
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
      id: "type",
      header: "Type",
      cell: ({ row }) => (
        <span className="text-gray-11">{TYPE_WORD[row.original.type]}</span>
      ),
      meta: { width: 22, priority: 1 },
    }),
    {
      ...helper.accessor("change", {
        header: "Change",
        cell: ({ row }) => (
          <span className="text-gray-12">
            {CHANGE_WORD[row.original.change]}
          </span>
        ),
        // Every change word fits. Hidden after Pull
        // request: the pane names the change too.
        meta: { width: 20, priority: 4 },
      }),
      // Pointer only: the Status card carries the same sentence (#1399).
      card: {
        keyboard: false,
        content: (row) => ({
          body: [changeSentence(row, context)],
          readAge: null,
        }),
      },
    },
    {
      ...helper.display({
        id: "pull-request",
        header: "Pull request",
        cell: ({ row }) => <PullRequestLinks row={row.original} />,
        meta: { width: 28, priority: 3 },
      }),
      // Pointer only: the Status card names the review and its reviewers.
      card: { keyboard: false, content: pullRequestCard },
    },
    helper.display({
      id: "also-in",
      header: "Also in",
      cell: ({ row }) => (
        <span className="text-gray-11">{alsoInWords(row.original)}</span>
      ),
      // Two stage names, Pending proposal, Pending review, fit.
      meta: { width: 56, priority: 2 },
    }),
    helper.display({
      id: ACTIONS_COLUMN_ID,
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <RowMenu
          label={rowMenuLabel(row.original)}
          // Dialogs and writes, never the pane: focus comes back to ⋮.
          items={row.original.items.map((item) => ({
            ...item,
            movesFocus: false,
          }))}
          tabStop={false}
          busy={row.original.items.some((item) => item.busy !== undefined)}
        />
      ),
      meta: { width: 10 },
    }),
  ]);
