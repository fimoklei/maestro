// One row per status, so a new status fails typecheck until it has copy.
import {
  reading,
  type StatusFamily,
  type StatusReading,
} from "../ui/status-reading";
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

// Pending proposal is the one stage drawn while empty, so these are the
// view's most-read words. `journey` states that every stage answered empty;
// `stage` names the two ways to put a change here (#867).
export const PROPOSAL_EMPTY = {
  journey: {
    title: "No changes yet",
    body: "Skills you import or edit in your clone will appear here.",
  },
  stage: {
    title: "No changes to propose yet",
    body: "Changes you make in your clone appear here. Select Import skill… to bring one in.",
  },
} as const;

const FAMILIES: Record<StageStatus, StatusFamily> = {
  "not-yet-proposed": "neutral",
  "new-local-work": "neutral",
  "deleted-locally": "neutral",
  "waiting-for-review": "neutral",
  draft: "neutral",
  "changes-requested": "attention",
  "approved-awaiting-merge": "good",
  "pull-request-missing": "attention",
  // A merged proposal is the normal end of a review, not an exception. Only
  // origin/HEAD lagging behind keeps the row on screen at all (#889).
  "proposal-merged": "neutral",
  "proposal-closed": "attention",
  "multiple-pull-requests": "attention",
  added: "neutral",
  changed: "neutral",
  renamed: "neutral",
  deleted: "neutral",
};

// A deletion keeps its own reading in every stage, so a local deletion never
// relabels an earlier change somewhere else.
const READINGS: Record<StageStatus, string> = {
  "not-yet-proposed": "Not yet proposed",
  "new-local-work": "New local work",
  "deleted-locally": "Deleted locally",
  draft: "Draft",
  "waiting-for-review": "Waiting for review",
  "changes-requested": "Changes requested",
  "approved-awaiting-merge": "Approved, awaiting merge",
  "pull-request-missing": "Pull request missing",
  "proposal-merged": "Proposal merged",
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
  "proposal-merged": "Deletion merged",
};

// A stuck row is a warning, not a lag, so it carries ⚠ rather than ↑.
export const statusReading = (row: HarnessStageRow): StatusReading => {
  const family = FAMILIES[row.status];
  return reading(
    (row.deletion ? DELETION_READINGS[row.status] : undefined) ??
      READINGS[row.status],
    family,
    family === "attention" ? "⚠" : undefined,
  );
};

// The facts a sentence substitutes into: both come from the same read the rows
// did, so a Detail never names a branch or release the rows were not read from.
export type StageContext = {
  defaultBranch: string | null;
  releasedVersion: string | null;
};

const requestNumbers = (row: HarnessStageRow): string[] =>
  row.requests.map((request) => `#${request.number}`);

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
  // Two ways on where local HEAD still holds the folder: propose the deletion,
  // or take it back. The sentence names both controls the row offers (#915).
  const deleteLocally = row.restorable
    ? `This skill is deleted in your clone but still on ${branch}. Select Propose change to propose the deletion, or Restore skill to bring it back.`
    : `This skill is deleted in your clone but still on ${branch}. Select Propose change to propose the deletion.`;
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
        ? `Pull request ${first(row)} proposes deleting this skill and is still a draft. Select View pull request to mark it ready for review.`
        : `Pull request ${first(row)} is a draft. Select View pull request to mark it ready for review.`;
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
        ? `Pull request ${first(row)} proposes deleting this skill and is approved. Select View pull request to merge it.`
        : `Pull request ${first(row)} is approved. Select View pull request to merge it.`;
    case "pull-request-missing":
      return "The proposal branch is on GitHub without a pull request. Select Create pull request to open one.";
    case "proposal-merged":
      return row.deletion
        ? `Pull request ${first(row)} merged the deletion. Select Re-read Harness to read GitHub again.`
        : `Pull request ${first(row)} was merged. Select Re-read Harness to read GitHub again.`;
    case "proposal-closed":
      return `Pull request ${first(row)} was closed without merging. Select Reopen proposal to continue it.`;
    case "multiple-pull-requests":
      // The row's own link labels are numbered here, so the sentence names
      // one that exists rather than a bare View pull request (#883).
      return `${
        row.requests.length === 2
          ? `Pull requests ${listOf(requestNumbers(row))} both match this branch.`
          : "Several pull requests match this branch."
      } Open the extra pull requests on GitHub and close them.`;
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
export const requestedReviewers = (row: HarnessStageRow): string | null =>
  row.reviewers.length === 0
    ? null
    : row.reviewers.map(reviewerName).join(", ");

export const reviewerLine = (row: HarnessStageRow): string | null => {
  const requested = requestedReviewers(row);
  return requested === null ? null : `Review requested from ${requested}`;
};

export const pullRequestLinkName = (number: number): string =>
  `Pull request #${number}, opens in a new tab`;

// `into` stands in for the arrow between the branches, which is not read out.
export const PULL_REQUEST_CARD = {
  review: "Review",
  requested: "Requested",
  branch: "Branch",
  into: "into",
} as const;

const REQUEST_STATES: Partial<Record<StageStatus, string>> = {
  draft: "Draft",
  "waiting-for-review": "Open",
  "changes-requested": "Open",
  "approved-awaiting-merge": "Open",
  "multiple-pull-requests": "Open",
  "proposal-merged": "Merged",
  "proposal-closed": "Closed",
};

export const pullRequestState = (row: HarnessStageRow): string | null =>
  REQUEST_STATES[row.status] ?? null;

const REVIEW_WORDS: Partial<Record<StageStatus, string>> = {
  "waiting-for-review": "Waiting for review",
  "changes-requested": "Changes requested",
  "approved-awaiting-merge": "Approved",
};

export const reviewWord = (row: HarnessStageRow): string | null =>
  REVIEW_WORDS[row.status] ?? null;

export const alsoInWords = (row: HarnessStageRow): string =>
  (row.alsoIn ?? []).map((stage) => STAGE_NAMES[stage]).join(", ");

// Suppressed where any membership is unknown: "only here" is a claim, and an
// unread stage cannot back it.
export const crossStageLine = (row: HarnessStageRow): string | null => {
  if (row.alsoIn === null || row.alsoIn.length === 0) {
    return null;
  }
  return `Also in ${listOf(row.alsoIn.map((stage) => STAGE_NAMES[stage]))}.`;
};
