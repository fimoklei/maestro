// Every word the three stage tables show: the chip reading and its colour, the
// Detail sentence, the reviewer line and the cross-stage line. One row per
// status, so a new status fails typecheck until it has copy (copy.md,
// ADR-0025).
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

// "#41 and #44", or "#41, #44 and #47" — the shape an author reads aloud.
const listOf = (parts: string[]): string => {
  if (parts.length < 2) {
    return parts[0] ?? "";
  }
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
};

const first = (row: HarnessStageRow): string => requestNumbers(row)[0] ?? "";

// One sentence per row, stating the cause. The actions live in the row menu,
// which is why no sentence here carries an instruction.
export function detailSentence(
  row: HarnessStageRow,
  { defaultBranch, releasedVersion }: StageContext,
): string {
  const branch = defaultBranch ?? "the default branch";
  const release = releasedVersion;
  switch (row.status) {
    case "not-yet-proposed":
      return row.deletion
        ? `You deleted this skill from your clone; ${branch} still carries it.`
        : `Your local copy differs from ${branch} and no proposal covers it yet.`;
    case "deleted-locally":
      return `You deleted this skill from your clone; ${branch} still carries it.`;
    case "new-local-work":
      return first(row) === ""
        ? "You edited this skill after preparing its proposal."
        : `Update proposal will add the edits you made since pull request ${first(row)}.`;
    case "draft":
      return row.deletion
        ? `Pull request ${first(row)} proposes deleting this skill and is still a draft.`
        : `Pull request ${first(row)} is a draft, so no reviewer sees it yet.`;
    case "waiting-for-review":
      return row.deletion
        ? `Pull request ${first(row)} proposes deleting this skill from the Harness.`
        : `Pull request ${first(row)} is open and waiting for a reviewer.`;
    case "changes-requested":
      return row.deletion
        ? `A reviewer asked for changes on pull request ${first(row)}, which proposes deleting this skill.`
        : `A reviewer asked for changes on pull request ${first(row)}; the review is on GitHub.`;
    case "approved-awaiting-merge":
      return row.deletion
        ? `Pull request ${first(row)} proposes deleting this skill and can be merged on GitHub.`
        : `Pull request ${first(row)} is approved and can be merged on GitHub.`;
    case "pull-request-missing":
      return "The proposal branch is pushed, but no pull request opens it.";
    case "proposal-closed":
      return `Pull request ${first(row)} is closed and its content is not on ${branch}.`;
    case "multiple-pull-requests":
      return row.requests.length === 2
        ? `Pull requests ${listOf(requestNumbers(row))} both match this branch, so close one on GitHub.`
        : `Pull requests ${listOf(requestNumbers(row))} all match this branch, so close all but one on GitHub.`;
    case "added":
      return release === null
        ? `This skill is on ${branch} and in no release yet.`
        : `This skill was added to ${branch} after release ${release}.`;
    case "changed":
      return release === null
        ? `This skill is on ${branch} and in no release yet.`
        : `This skill changed on ${branch} after release ${release}.`;
    case "renamed":
      return row.previousName === null
        ? `This skill was renamed on ${branch}.`
        : `This skill was renamed from ${row.previousName} on ${branch}.`;
    case "deleted":
      return release === null
        ? `This skill is no longer on ${branch}.`
        : `This skill was deleted from ${branch} after release ${release}.`;
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
