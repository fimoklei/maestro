import type {
  BatchItemError,
  BatchItemOutcome,
  BatchProposal,
  BatchReport,
  BatchRequest,
  HarnessChange,
  PrimitiveRef,
  PromoteDeletionError,
  PromoteError,
  PullRequestRef,
} from "@maestro/core";
import { TYPE_WORD } from "../inventory/type-filter";
import type { NoticeCopy } from "../ui/notice";
import { plainText } from "../ui/phrase";
import type { ReportGroup } from "../ui/report";
import { CHANGE_WORD } from "./change-words";
import { ITEM_WORDS } from "./item-words";
import { deletionHeadings, promoteHeadings } from "./notice-copy";
import {
  CREATE_PULL_REQUEST_ON_GITHUB,
  NOT_PROPOSED,
  PROPOSED,
  PROPOSED_NOTE,
  PULL_REQUEST_MISSING,
  PULL_REQUEST_MISSING_DETAIL,
} from "./propose-batch-copy";

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
        // The confirmation blocks a deletion without a tree, so the empty
        // one never leaves; the server would refuse it as stale.
        seenRemoteTree: item.seenRemoteTree ?? "",
      }
    : { type: item.type, name: item.name };

// Items under their Change word, in the Change column's order; empty
// groups are dropped.
function byChange<Row>(
  items: readonly BatchItem[],
  rowOf: (item: BatchItem) => Row,
) {
  return CHANGES.map((change) => {
    const rows = items.filter((item) => item.change === change);
    return {
      change,
      tone: "neutral" as const,
      legend: `${CHANGE_WORD[change]} · ${rows.length}`,
      rows: rows.map(rowOf),
    };
  }).filter((group) => group.rows.length > 0);
}

/** The confirmation's groups: Added and Changed fold shut, Deleted stays open and last. */
export const confirmationGroups = (items: readonly BatchItem[]) =>
  byChange(items, (item) => ({
    key: keyOf(item),
    name: item.name,
    slots: [TYPE_WORD[item.type]],
  })).map(({ change, ...group }) => ({
    ...group,
    folded: change !== "deletion",
  }));

/** Where one item stands while the batch runs. */
export type RunningState =
  | { state: "waiting" }
  | { state: "in-progress" }
  | { state: "failed" }
  | {
      state: "proposed";
      /** Null where the pull request is missing. */
      pullRequest: PullRequestRef | null;
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
  return byChange(items, (item) => ({
    key: keyOf(item),
    name: item.name,
    type: TYPE_WORD[item.type],
    standing: stateOf(item),
  })).map(({ change: _change, ...group }) => group);
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

const sameNotice = (a: NoticeCopy, b: NoticeCopy) =>
  a.label === b.label &&
  plainText(a.message) === plainText(b.message) &&
  (a.detail === undefined ? "" : plainText(a.detail)) ===
    (b.detail === undefined ? "" : plainText(b.detail));

// A line covering a skill and a prompt splits where their words differ.
function byNotice(
  error: BatchItemError,
  refs: readonly PrimitiveRef[],
  itemOf: (ref: PrimitiveRef) => BatchItem | undefined,
) {
  const lines: { notice: NoticeCopy; items: PrimitiveRef[] }[] = [];
  for (const ref of refs) {
    const notice = noticeFor(error, ref, itemOf(ref));
    const same = lines.find((line) => sameNotice(line.notice, notice));
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
  // A pushed branch whose pull request did not open is not proposed yet.
  const opened: { each: BatchProposal; request: PullRequestRef }[] = [];
  const missing: BatchProposal[] = [];
  for (const each of report.proposed) {
    const { pullRequest } = each;
    if (pullRequest.state === "missing") {
      missing.push(each);
    } else {
      opened.push({
        each,
        request: { number: pullRequest.number, url: pullRequest.url },
      });
    }
  }
  const noGh = report.gh === "absent";
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
      tone: "attention",
      label: PULL_REQUEST_MISSING,
      // Without gh the lead states every row's next step once.
      calm: noGh,
      // The closing step stays when no Proposed group draws to carry it.
      ...(opened.length === 0 ? { note: PROPOSED_NOTE } : {}),
      rows: missing.map((each) => ({
        name: each.name,
        change: changeOf(each),
        compare: { label: CREATE_PULL_REQUEST_ON_GITHUB, url: each.compareUrl },
        ...(noGh ? {} : { detail: PULL_REQUEST_MISSING_DETAIL }),
      })),
    },
    {
      tone: "good",
      label: PROPOSED,
      note: PROPOSED_NOTE,
      rows: opened.map(({ each, request }) => ({
        name: each.name,
        change: changeOf(each),
        pullRequest: request,
      })),
    },
  ];
}
