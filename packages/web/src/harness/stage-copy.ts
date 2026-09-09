// Every word the three stage tables show. One row per status, so a new status
// fails typecheck until it has copy (copy.md, ADR-0025).
import type { ChipProps } from "../ui/chip";
import type {
  HarnessStage,
  HarnessStageRow,
  RequestedReviewer,
  StageStatus,
} from "./use-harness";

export const STAGE_NAMES: Record<HarnessStage, string> = {
  "pending-proposal": "Pending proposal",
  "pending-review": "Pending review",
  "pending-release": "Pending release",
};

// Grey for waiting and local work, amber for exceptional author action, green
// for merged changes. Colour never carries the reading: every chip is text.
const TONES: Record<StageStatus, NonNullable<ChipProps["tone"]>> = {
  "not-yet-proposed": "dim",
  "new-local-work": "dim",
  "deleted-locally": "dim",
  "waiting-for-review": "dim",
  draft: "drift",
  "changes-requested": "drift",
  "approved-awaiting-merge": "drift",
  "pull-request-missing": "drift",
  "proposal-closed": "drift",
  "multiple-pull-requests": "drift",
  added: "ok",
  changed: "ok",
  renamed: "ok",
  deleted: "ok",
};

// A deletion keeps its own reading in every stage, so a local deletion never
// relabels an earlier change somewhere else (ADR-0021 · 10).
const READINGS: Record<StageStatus, string> = {
  "not-yet-proposed": "Not yet proposed",
  "new-local-work": "New local work",
  "deleted-locally": "Deleted locally",
  draft: "Draft",
  "waiting-for-review": "Waiting for review",
  "changes-requested": "Changes requested",
  "approved-awaiting-merge": "Approved, awaiting merge",
  "pull-request-missing": "Pull request missing",
  "proposal-closed": "Proposal closed",
  "multiple-pull-requests": "Multiple pull requests",
  added: "Added",
  changed: "Changed",
  renamed: "Renamed",
  deleted: "Deleted",
};

const DELETION_READINGS: Partial<Record<StageStatus, string>> = {
  draft: "Deletion in draft",
  "waiting-for-review": "Deletion waiting for review",
  "changes-requested": "Deletion changes requested",
  "approved-awaiting-merge": "Deletion approved, awaiting merge",
};

export const statusTone = (row: HarnessStageRow) => TONES[row.status];

export const statusReading = (row: HarnessStageRow): string =>
  (row.deletion ? DELETION_READINGS[row.status] : undefined) ??
  READINGS[row.status];

// The facts a sentence substitutes into: both come from the same read the rows
// did, so a Detail never names a branch or release the rows were not read from.
export type StageContext = {
  defaultBranch: string | null;
  releasedVersion: string | null;
};

const requestNumbers = (row: HarnessStageRow): string[] =>
  row.requests.map((request) => `#${request.number}`);

// "#41 and #44", or "Pending review and Pending release" — read aloud.
const listOf = (parts: string[]): string => {
  if (parts.length < 2) {
    return parts[0] ?? "";
  }
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
};

const first = (row: HarnessStageRow): string => requestNumbers(row)[0] ?? "";

// Cause first, then `Select {control} to {result}` with the row's own control
// (#838). A status with no cockpit control names the place instead.
export function detailSentence(
  row: HarnessStageRow,
  { defaultBranch, releasedVersion }: StageContext,
): string {
  const branch = defaultBranch ?? "the default branch";
  const release = releasedVersion;
  const publish = "Select Create a release to publish it.";
  const deleteLocally = `This skill is deleted in your clone but still on ${branch}. Select Propose change to propose the deletion.`;
  switch (row.status) {
    case "not-yet-proposed":
      return row.deletion
        ? deleteLocally
        : `Your local copy differs from ${branch}. Select Propose change to send it for review.`;
    case "deleted-locally":
      return deleteLocally;
    case "new-local-work":
      return first(row) === ""
        ? "You edited this skill after preparing its proposal. Select Update proposal to send the edits."
        : `You edited this skill after pull request ${first(row)}. Select Update proposal to send the edits.`;
    case "draft":
      return row.deletion
        ? `Pull request ${first(row)} proposes deleting this skill and is still a draft. Mark it ready for review on GitHub.`
        : `Pull request ${first(row)} is a draft. Mark it ready for review on GitHub.`;
    case "waiting-for-review":
      return row.deletion
        ? `Pull request ${first(row)} proposes deleting this skill and is waiting for a reviewer.`
        : `Pull request ${first(row)} is open and waiting for a reviewer.`;
    case "changes-requested":
      return row.deletion
        ? `A reviewer asked for changes on the deletion in pull request ${first(row)}. Select Update proposal to send your changes.`
        : `A reviewer asked for changes on pull request ${first(row)}. Select Update proposal to send your changes.`;
    case "approved-awaiting-merge":
      return row.deletion
        ? `Pull request ${first(row)} proposes deleting this skill and is approved. Merge it on GitHub.`
        : `Pull request ${first(row)} is approved. Merge it on GitHub.`;
    case "pull-request-missing":
      return "The proposal branch is on GitHub without a pull request. Select Create pull request to open one.";
    case "proposal-closed":
      return `Pull request ${first(row)} was closed without merging. Select Reopen proposal to continue it.`;
    case "multiple-pull-requests":
      return row.requests.length === 2
        ? `Pull requests ${listOf(requestNumbers(row))} both match this branch, so close one on GitHub.`
        : "Several pull requests match this branch, so close all but one on GitHub.";
    case "added":
      return release === null
        ? `This skill is on ${branch} and in no release yet. ${publish}`
        : `This skill was added to ${branch} after release ${release}. ${publish}`;
    case "changed":
      return release === null
        ? `This skill is on ${branch} and in no release yet. ${publish}`
        : `This skill changed on ${branch} after release ${release}. ${publish}`;
    case "renamed":
      return row.previousName === null
        ? `This skill was renamed on ${branch}. ${publish}`
        : `This skill was renamed from ${row.previousName} on ${branch}. ${publish}`;
    case "deleted":
      return release === null
        ? `This skill is no longer on ${branch}. Select Create a release to publish the deletion.`
        : `This skill was deleted from ${branch} after release ${release}. Select Create a release to publish the deletion.`;
  }
}

const reviewerName = (reviewer: RequestedReviewer): string =>
  reviewer.kind === "user" ? `@${reviewer.login}` : `@${reviewer.slug}`;

// Uncapped: a review asked of eight people is a fact about the review, and
// hiding the tail would leave the author guessing (#825).
export const reviewerLine = (row: HarnessStageRow): string | null =>
  row.reviewers.length === 0
    ? null
    : `Review requested from ${row.reviewers.map(reviewerName).join(", ")}`;

// Suppressed where any membership is unknown: "only here" is a claim, and an
// unread stage cannot back it.
export const crossStageLine = (row: HarnessStageRow): string | null => {
  if (row.alsoIn === null || row.alsoIn.length === 0) {
    return null;
  }
  return `Also in ${listOf(row.alsoIn.map((stage) => STAGE_NAMES[stage]))}.`;
};
