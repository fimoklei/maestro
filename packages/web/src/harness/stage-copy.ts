// One row per status, so a new status fails typecheck until it has copy.
import type {
  HarnessChange,
  HarnessStage,
  HarnessStageRow,
  RequestedReviewer,
  StageStatus,
} from "@maestro/core";
import { CREATE_RELEASE, UPDATE_TARGET } from "../ui/control-labels";
import { type Copy, machine, named, phrase } from "../ui/phrase";
import type { StatusFamily } from "../ui/status-family";
import { reading, type StatusReading } from "../ui/status-reading";
import { offersDiscard } from "./row-actions";

export const STAGE_NAMES: Record<HarnessStage, string> = {
  "pending-proposal": "Pending proposal",
  "pending-review": "Pending review",
  "pending-release": "Pending release",
};

export const JOURNEY_EMPTY = {
  title: "No changes yet",
  body: "Skills you import or edit in your clone will appear here.",
} as const;

const FAMILIES: Record<StageStatus, StatusFamily> = {
  "not-yet-proposed": "neutral",
  "new-local-work": "neutral",
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
  // Nothing for the author to fix: the wait ends on GitHub (#1373).
  "proposed-by-other": "neutral",
  "not-yet-released": "neutral",
};

// Where a change stands only: the Change column names what it does (#1399).
// Proposed by {login} carries a name, so `statusReading` builds it.
const READINGS: Record<Exclude<StageStatus, "proposed-by-other">, string> = {
  "not-yet-proposed": "Not yet proposed",
  "new-local-work": "New local work",
  draft: "Draft",
  "waiting-for-review": "Waiting for review",
  "changes-requested": "Changes requested",
  "approved-awaiting-merge": "Approved, awaiting merge",
  "pull-request-missing": "Pull request missing",
  "proposal-merged": "Proposal merged",
  "proposal-closed": "Proposal closed",
  "multiple-pull-requests": "Multiple pull requests",
  "not-yet-released": "Not yet released",
};

// A stuck row is a warning, not a lag, so it carries ⚠ rather than ↑.
export const statusReading = (row: HarnessStageRow): StatusReading => {
  const family = FAMILIES[row.status];
  return reading(
    row.status === "proposed-by-other"
      ? `Proposed by ${row.waitingOn ?? "another contributor"}`
      : READINGS[row.status],
    family,
    family === "attention" ? "⚠" : undefined,
  );
};

export const CHANGE_WORDS: Record<HarnessChange, string> = {
  addition: "Addition",
  edit: "Edit",
  deletion: "Deletion",
  rename: "Rename",
};

/** The default branch as a sentence names it: its name set apart, else words. */
export const defaultBranchCopy = (defaultBranch: string | null) =>
  defaultBranch === null ? "the default branch" : machine(defaultBranch);

// The facts a sentence substitutes into: both come from the same read the rows
// did, so a Detail never names a branch or release the rows were not read from.
export type StageContext = {
  defaultBranch: string | null;
  releasedVersion: string | null;
  // The Harness as the Origin fact names it.
  origin: string;
};

// The Change cell's hover card: what merging does to the Harness, never why.
export function changeSentence(
  row: HarnessStageRow,
  { origin }: StageContext,
): Copy {
  const skill = named(row.skill);
  const harness = machine(origin);
  switch (row.change) {
    case "addition":
      return phrase`This change adds ${skill} to ${harness}.`;
    case "edit":
      return phrase`This change edits ${skill} in ${harness}.`;
    case "deletion":
      return phrase`This change deletes ${skill} from ${harness}.`;
    case "rename":
      return row.previousName === null
        ? phrase`This change renames ${skill} in ${harness}.`
        : phrase`This change renames ${named(row.previousName)} to ${skill} in ${harness}.`;
  }
}

const requestNumbers = (row: HarnessStageRow): string[] =>
  row.requests.map((request) => `#${request.number}`);

const listOf = (parts: string[]): string => {
  if (parts.length < 2) {
    return parts[0] ?? "";
  }
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
};

const first = (row: HarnessStageRow): string => requestNumbers(row)[0] ?? "";

const waitSentence = (row: HarnessStageRow, login: string): Copy =>
  phrase`${named(login)} has pull request ${first(row)} open for this skill. Wait until it is merged or closed.`;

// Cause first, then `Select {control} to {result}` with the row's own control
// (#838). A status with no cockpit control names the place instead.
export function detailSentence(
  row: HarnessStageRow,
  { defaultBranch, releasedVersion }: StageContext,
): Copy {
  const branch = defaultBranchCopy(defaultBranch);
  const release = releasedVersion === null ? null : machine(releasedVersion);
  const publish = `Select ${CREATE_RELEASE} to publish it.`;
  const deletion = row.change === "deletion";
  // One next action; Restore skill stays in the row menu (#1396).
  const deleteLocally = phrase`This skill is deleted in your clone but still on ${branch}. Select Propose change to propose the deletion.`;
  // Local work behind another contributor's request offers no Propose change.
  if (row.waitingOn !== null) {
    return waitSentence(row, row.waitingOn);
  }
  switch (row.status) {
    case "not-yet-proposed":
      if (deletion) {
        return deleteLocally;
      }
      if (row.change === "addition") {
        return phrase`This skill is not on ${branch} yet. Select Propose change to send it for review.`;
      }
      return offersDiscard(row)
        ? phrase`Your local copy differs from ${branch}. Select Propose change to send it for review, or Discard change to match ${branch} again.`
        : phrase`Your local copy differs from ${branch}. Select Propose change to send it for review.`;
    case "new-local-work":
      return first(row) === ""
        ? "You edited this skill after preparing its proposal. Select Update proposal to send the edits."
        : `You edited this skill after pull request ${first(row)}. Select Update proposal to send the edits.`;
    case "draft":
      return deletion
        ? `Pull request ${first(row)} proposes deleting this skill and is still a draft. Select View pull request to mark it ready for review.`
        : `Pull request ${first(row)} is a draft. Select View pull request to mark it ready for review.`;
    case "waiting-for-review":
      return deletion
        ? `Pull request ${first(row)} proposes deleting this skill and is waiting for a reviewer.`
        : `Pull request ${first(row)} is open and waiting for a reviewer.`;
    case "changes-requested":
      return deletion
        ? `A reviewer asked for changes on the deletion in pull request ${first(row)}. Select Update proposal to send your changes.`
        : `A reviewer asked for changes on pull request ${first(row)}. Select Update proposal to send your changes.`;
    case "approved-awaiting-merge":
      return deletion
        ? `Pull request ${first(row)} proposes deleting this skill and is approved. Select View pull request to merge it.`
        : `Pull request ${first(row)} is approved. Select View pull request to merge it.`;
    case "pull-request-missing":
      return "The proposal branch is on GitHub without a pull request. Select Create pull request to open one.";
    case "proposal-merged":
      return deletion
        ? `Pull request ${first(row)} merged the deletion. Select Re-read Harness to read GitHub again.`
        : `Pull request ${first(row)} was merged. Select Re-read Harness to read GitHub again.`;
    case "proposal-closed": {
      if (deletion && row.folderOnDisk) {
        return `Pull request ${first(row)} was closed without merging. The folder is back in your clone, so the skill stays in the Harness.`;
      }
      // Only its author reopens it, so the menu offers no Reopen proposal.
      const [closed] = row.requests;
      return closed?.byOther === true
        ? phrase`${named(closed.author)}'s pull request ${first(row)} was closed without merging. Select Propose change to send your own change.`
        : `Pull request ${first(row)} was closed without merging. Select Reopen proposal to continue it.`;
    }
    case "multiple-pull-requests":
      // The row's own link labels are numbered here, so the sentence names
      // one that exists rather than a bare View pull request (#883).
      return `${
        row.requests.length === 2
          ? `Pull requests ${listOf(requestNumbers(row))} both match this branch.`
          : "Several pull requests match this branch."
      } Open the extra pull requests on GitHub and close them.`;
    case "proposed-by-other":
      return `Another contributor has pull request ${first(row)} open for this skill. Wait until it is merged or closed.`;
    case "not-yet-released":
      return releaseSentence(row, branch, release, publish);
  }
}

function releaseSentence(
  row: HarnessStageRow,
  branch: ReturnType<typeof defaultBranchCopy>,
  release: ReturnType<typeof machine> | null,
  publish: string,
): Copy {
  switch (row.change) {
    case "addition":
      return release === null
        ? phrase`This skill is on ${branch} and in no release yet. ${publish}`
        : phrase`This skill was added to ${branch} after release ${release}. ${publish}`;
    case "edit":
      return release === null
        ? phrase`This skill is on ${branch} and in no release yet. ${publish}`
        : phrase`This skill changed on ${branch} after release ${release}. ${publish}`;
    case "rename":
      return row.previousName === null
        ? phrase`This skill was renamed on ${branch}. ${publish}`
        : phrase`This skill was renamed from ${named(row.previousName)} on ${branch}. ${publish}`;
    case "deletion":
      return release === null
        ? phrase`This skill is no longer on ${branch}. Select ${CREATE_RELEASE} to publish the deletion.`
        : phrase`This skill was deleted from ${branch} after release ${release}. Select ${CREATE_RELEASE} to publish the deletion.`;
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
  "proposed-by-other": "Open",
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

// Deployed copies come from a release only, so local work on a skill the
// default branch holds has not reached them (#1160).
export const deployedCopiesLine = (row: HarnessStageRow): string | null =>
  row.stage === "pending-proposal" && row.change === "edit"
    ? `Deployed copies change only after a release and ${UPDATE_TARGET}.`
    : null;

// Suppressed where any membership is unknown: "only here" is a claim, and an
// unread stage cannot back it.
export const crossStageLine = (row: HarnessStageRow): string | null => {
  if (row.alsoIn === null || row.alsoIn.length === 0) {
    return null;
  }
  return `Also in ${listOf(row.alsoIn.map((stage) => STAGE_NAMES[stage]))}.`;
};
