import type {
  BatchItemError,
  BatchItemOutcome,
  BatchReport,
  HarnessChange,
  HarnessPrimitiveType,
  PrimitiveRef,
} from "@maestro/core";
import { TYPE_WORD } from "../inventory/type-filter";
import type { NoticeCopy } from "../ui/notice";
import type { ReportGroup } from "../ui/report";
import { CHANGE_WORD } from "./change-words";
import { ITEM_WORDS } from "./item-words";
import { promoteHeadings } from "./notice-copy";
import { NOT_PROPOSED, PROPOSED, PROPOSED_NOTE } from "./propose-batch-copy";

/** An item as the reader ticked it: what it is and what it changes. */
export type BatchItem = PrimitiveRef & { change: HarnessChange };

const keyOf = ({ type, name }: PrimitiveRef) => `${type}:${name}`;

// The order the Change column reads in.
const CHANGES: HarnessChange[] = ["addition", "edit", "rename", "deletion"];

/** Where one item stands while the batch runs. */
export type RunningState =
  | { state: "waiting" }
  | { state: "in-progress" }
  | { state: "failed" }
  | {
      state: "proposed";
      /** Null where the pull request is missing. */
      pullRequest: { number: number; url: string } | null;
    };

/**
 * The running batch: its items under their Change word, each with its type
 * and where it stands. Items run in order, so the first one with no outcome
 * is the one in progress.
 */
export function runningGroups(
  items: readonly BatchItem[],
  outcomes: readonly BatchItemOutcome[],
) {
  const landed = new Map(outcomes.map((outcome) => [keyOf(outcome), outcome]));
  const current = items.find((item) => !landed.has(keyOf(item)));
  const stateOf = (item: BatchItem): RunningState => {
    const outcome = landed.get(keyOf(item));
    if (outcome === undefined) {
      return { state: item === current ? "in-progress" : "waiting" };
    }
    if (!outcome.ok) return { state: "failed" };
    const { pullRequest } = outcome;
    return {
      state: "proposed",
      pullRequest:
        pullRequest.state === "missing"
          ? null
          : { number: pullRequest.number, url: pullRequest.url },
    };
  };
  return CHANGES.map((change) => {
    const rows = items.filter((item) => item.change === change);
    return {
      tone: "neutral" as const,
      legend: `${CHANGE_WORD[change]} · ${rows.length}`,
      rows: rows.map((item) => ({
        key: keyOf(item),
        name: item.name,
        type: TYPE_WORD[item.type],
        standing: stateOf(item),
      })),
    };
  }).filter((group) => group.rows.length > 0);
}

const noticeFor = (
  error: BatchItemError,
  type: HarnessPrimitiveType,
): NoticeCopy => promoteHeadings(ITEM_WORDS[type])[error];

// A line covering a skill and a prompt splits where their words differ.
function byNotice(error: BatchItemError, items: readonly PrimitiveRef[]) {
  const lines: { notice: NoticeCopy; items: PrimitiveRef[] }[] = [];
  for (const item of items) {
    const notice = noticeFor(error, item.type);
    const same = lines.find(
      (line) => JSON.stringify(line.notice) === JSON.stringify(notice),
    );
    if (same === undefined) lines.push({ notice, items: [item] });
    else same.items.push(item);
  }
  return lines;
}

/** The report: failures collapsed by reason, then each proposed item. */
export function reportGroups(
  report: BatchReport,
  items: readonly BatchItem[],
): ReportGroup[] {
  const changeOf = (ref: PrimitiveRef) => {
    const item = items.find((each) => keyOf(each) === keyOf(ref));
    return item === undefined ? undefined : CHANGE_WORD[item.change];
  };
  return [
    {
      tone: "failed",
      label: NOT_PROPOSED,
      rows: report.failed.flatMap(({ error, items: failed }) =>
        byNotice(error, failed).map((line) => {
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
