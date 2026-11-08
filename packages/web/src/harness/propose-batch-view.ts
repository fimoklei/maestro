import type {
  BatchItemError,
  BatchReport,
  BatchRequest,
  HarnessChange,
  PrimitiveRef,
  PromoteDeletionError,
  PromoteError,
} from "@maestro/core";
import { TYPE_WORD } from "../inventory/type-filter";
import type { NoticeCopy } from "../ui/notice";
import type { ReportGroup } from "../ui/report";
import { CHANGE_WORD } from "./change-words";
import { ITEM_WORDS } from "./item-words";
import { deletionHeadings, promoteHeadings } from "./notice-copy";
import { NOT_PROPOSED, PROPOSED, PROPOSED_NOTE } from "./propose-batch-copy";

/**
 * An item as the reader ticked it: what it is, what it changes, and for a
 * deletion the default-branch tree its row showed (null where none).
 */
export type BatchItem = PrimitiveRef & {
  change: HarnessChange;
  seenRemoteTree: string | null;
};

const keyOf = ({ type, name }: PrimitiveRef) => `${type}:${name}`;

// The order the Change column reads in.
const CHANGES: HarnessChange[] = ["addition", "edit", "rename", "deletion"];

/** The request for a ticked item; a deletion carries the tree it was confirmed against. */
export const batchRequest = (item: BatchItem): BatchRequest =>
  item.change === "deletion"
    ? {
        type: item.type,
        name: item.name,
        // No tree to confirm: the server refuses the empty one as stale.
        seenRemoteTree: item.seenRemoteTree ?? "",
      }
    : { type: item.type, name: item.name };

/** The confirmation's groups: Added and Changed fold shut, Deleted stays open and last. */
export function confirmationGroups(items: readonly BatchItem[]) {
  return CHANGES.map((change) => {
    const rows = items.filter((item) => item.change === change);
    return {
      tone: "neutral" as const,
      legend: `${CHANGE_WORD[change]} · ${rows.length}`,
      folded: change !== "deletion",
      rows: rows.map((item) => ({
        key: keyOf(item),
        name: item.name,
        slots: [TYPE_WORD[item.type]],
      })),
    };
  }).filter((group) => group.rows.length > 0);
}

/** The running batch: its items under their Change word, each with its type. */
export function runningGroups(items: readonly BatchItem[]) {
  return CHANGES.map((change) => {
    const rows = items.filter((item) => item.change === change);
    return {
      tone: "neutral" as const,
      legend: `${CHANGE_WORD[change]} · ${rows.length}`,
      rows: rows.map((item) => ({
        key: keyOf(item),
        name: item.name,
        slots: [TYPE_WORD[item.type]],
      })),
    };
  }).filter((group) => group.rows.length > 0);
}

// A refusal reads in its own kind's words: a deletion's from the deletion
// table. Core returns only that kind's codes for an item, so each lookup holds.
const noticeFor = (
  error: BatchItemError,
  ref: PrimitiveRef,
  item: BatchItem | undefined,
): NoticeCopy => {
  const words = ITEM_WORDS[ref.type];
  return item?.change === "deletion"
    ? deletionHeadings(words)[error as PromoteDeletionError]
    : promoteHeadings(words)[error as PromoteError];
};

// A line covering a skill and a prompt splits where their words differ.
function byNotice(
  error: BatchItemError,
  refs: readonly PrimitiveRef[],
  itemOf: (ref: PrimitiveRef) => BatchItem | undefined,
) {
  const lines: { notice: NoticeCopy; items: PrimitiveRef[] }[] = [];
  for (const ref of refs) {
    const notice = noticeFor(error, ref, itemOf(ref));
    const same = lines.find(
      (line) => JSON.stringify(line.notice) === JSON.stringify(notice),
    );
    if (same === undefined) lines.push({ notice, items: [ref] });
    else same.items.push(ref);
  }
  return lines;
}

/** The report: failures collapsed by reason, then each proposed item. */
export function reportGroups(
  report: BatchReport,
  items: readonly BatchItem[],
): ReportGroup[] {
  const itemOf = (ref: PrimitiveRef) =>
    items.find((each) => keyOf(each) === keyOf(ref));
  const changeOf = (ref: PrimitiveRef) => {
    const item = itemOf(ref);
    return item === undefined ? undefined : CHANGE_WORD[item.change];
  };
  return [
    {
      tone: "failed",
      label: NOT_PROPOSED,
      rows: report.failed.flatMap(({ error, items: failed }) =>
        byNotice(error, failed, itemOf).map((line) => {
          const [only] = line.items;
          return {
            name: line.items.map((each) => each.name).join(", "),
            count: line.items.length,
            notice: line.notice,
            ...(line.items.length === 1 && only !== undefined
              ? { change: changeOf(only) }
              : {}),
          };
        }),
      ),
    },
    {
      tone: "good",
      label: PROPOSED,
      note: PROPOSED_NOTE,
      rows: report.proposed.map((each) => ({
        name: each.name,
        change: changeOf(each),
        ...(each.pullRequest.state === "missing"
          ? {}
          : {
              pullRequest: {
                number: each.pullRequest.number,
                url: each.pullRequest.url,
              },
            }),
      })),
    },
  ];
}
