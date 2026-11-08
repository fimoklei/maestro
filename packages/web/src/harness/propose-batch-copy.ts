import type { ProposeBatchError } from "@maestro/core";
import { CREATE_RELEASE, rereadLabel } from "../ui/control-labels";
import { CLOSE } from "../ui/dialog-copy";
import type { NoticeContent } from "../ui/notice";
import { type NoticeTable, noticeFromTable } from "../ui/notice-table";
import { ITEM_WORDS } from "./item-words";
import { harnessHeadings, promoteHeadings } from "./notice-copy";
import { BatchReportMissing } from "./use-harness";

// Propose changes, the selection bar's action on rows under Pending proposal.
export const PROPOSE_CHANGES = "Propose changes";

const changes = (count: number) => (count === 1 ? "change" : "changes");

export const proposeBatchTitle = (count: number) =>
  `Propose ${count} ${changes(count)}`;

// With no pull request opened at all, the batch only pushed its branches.
export const proposeBatchHeading = (
  opened: number,
  pushed: number,
  total: number,
) =>
  opened === 0 && pushed > 0
    ? `Pushed ${pushed} of ${total} ${changes(total)}`
    : `Proposed ${opened} of ${total} ${changes(total)}`;

export const NOT_PROPOSED = "Not proposed";
export const PROPOSED = "Proposed";
export const PROPOSED_NOTE = `Review and merge each pull request on GitHub. Then select ${CREATE_RELEASE}.`;
// A pushed branch whose pull request did not open: its next step, per row.
export const PULL_REQUEST_MISSING = "Pull request missing";
export const PULL_REQUEST_MISSING_DETAIL =
  "The proposal branch is on GitHub without a pull request. Select Close, then select Create pull request.";
export const CREATE_PULL_REQUEST_ON_GITHUB = "Create pull request on GitHub";

/** Deletions join a batch with their confirmation; until then they block it. */
export const DESELECT_DELETED = "Deselect the deleted items.";

const batchHeadings: NoticeTable<ProposeBatchError> = {
  ...harnessHeadings,
  "promote-in-progress": {
    ...promoteHeadings(ITEM_WORDS.skill)["promote-in-progress"],
    message: `Wait for that change to finish, then select ${PROPOSE_CHANGES} again.`,
  },
};

const NO_REPORT = {
  level: "error",
  label: "No report from Maestro",
  message: `Some changes may already be proposed. Select ${CLOSE}, then select ${rereadLabel("Harness")} to see each one.`,
} as const;

/** Why the batch ran no item, or why its report never came. */
export const proposeBatchNotice = (error: unknown): NoticeContent | null =>
  error instanceof BatchReportMissing
    ? NO_REPORT
    : noticeFromTable(batchHeadings, error, NO_REPORT);
