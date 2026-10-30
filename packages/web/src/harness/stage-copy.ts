// One row per status, so a new status fails typecheck until it has copy.
import type {
  HarnessChange,
  HarnessStage,
  HarnessStageRow,
  RequestedReviewer,
  StageStatus,
} from "@maestro/core";
import { BRANCH_FACT, NEXT_RELEASE } from "../ui/band-copy";
import { type BandCount, countOf } from "../ui/band-summary";
import {
  CREATE_RELEASE,
  DISCARD_CHANGE,
  EDIT_PROMPT,
  IMPORT_LOCAL_EDITS,
  PROPOSE_CHANGE,
  rereadLabel,
  UPDATE_TARGET,
} from "../ui/control-labels";
import { type Copy, machine, named, phrase } from "../ui/phrase";
import { type StatusFamily, WARNING_GLYPH } from "../ui/status-family";
import { reading, type StatusReading } from "../ui/status-reading";
import { ITEM_WORDS } from "./item-words";
import { listOf } from "./notice-copy";
import { offersDiscard } from "./row-actions";

export const STAGE_NAMES: Record<HarnessStage, string> = {
  "pending-proposal": "Pending proposal",
  "pending-review": "Pending review",
  "pending-release": "Pending release",
};

// Band 2's healthy word: nothing waits in review or release.
export const ALL_RELEASED = "All released";

/** Band 2's counts: the rows waiting in review and in release, by stage. Pending release at 0 blocks Create a release. */
export const harnessCounts = (stages: readonly HarnessStage[]): BandCount[] => [
  {
    word: STAGE_NAMES["pending-review"],
    count: countOf(stages, "pending-review"),
    family: "attention",
  },
  {
    word: STAGE_NAMES["pending-release"],
    count: countOf(stages, "pending-release"),
    family: "attention",
    gate: true,
  },
];

export const JOURNEY_EMPTY = {
  title: "No changes yet",
  body: "Skills and prompts you import or edit in your clone will appear here.",
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
    family === "attention" ? WARNING_GLYPH : undefined,
  );
};

// The facts a sentence substitutes into: both come from the same read the rows
// did, so a Detail never names a release the rows were not read from.
export type StageContext = {
  releasedVersion: string | null;
  // The Harness as the Origin fact names it.
  origin: string;
};

// The Change cell's hover card: what merging does to the Harness, never why.
export function changeSentence(
  row: HarnessStageRow,
  { origin }: StageContext,
): Copy {
  const skill = named(row.name);
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

const first = (row: HarnessStageRow): string => requestNumbers(row)[0] ?? "";

const waitSentence = (row: HarnessStageRow, login: string): Copy =>
  phrase`${named(login)} has pull request ${first(row)} open for this ${ITEM_WORDS[row.type].noun}. Wait until it is merged or closed.`;

// Cause first, then `Select {control} to {result}` with the row's own control
// (#838). A status with no cockpit control names the place instead.
export function detailSentence(
  row: HarnessStageRow,
  { releasedVersion }: StageContext,
): Copy {
  const release = releasedVersion === null ? null : machine(releasedVersion);
  const publish = `Select ${CREATE_RELEASE} to publish it.`;
  const deletion = row.change === "deletion";
  const noun = ITEM_WORDS[row.type].noun;
  // One next action; Restore stays in the row menu (#1396).
  const deleteLocally = phrase`This ${noun} is deleted in your clone but still in ${NEXT_RELEASE}. Select ${PROPOSE_CHANGE} to propose the deletion.`;
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
        return phrase`This ${noun} is not in ${NEXT_RELEASE} yet. Select ${PROPOSE_CHANGE} to send it for review.`;
      }
      return offersDiscard(row)
        ? `Your local copy differs from ${NEXT_RELEASE}. Select ${PROPOSE_CHANGE} to send it for review. Or select ${DISCARD_CHANGE} to match ${NEXT_RELEASE}.`
        : `Your local copy differs from ${NEXT_RELEASE}. Select ${PROPOSE_CHANGE} to send it for review.`;
    case "new-local-work":
      return first(row) === ""
        ? `You edited this ${noun} after preparing its proposal. Select Update proposal to send the edits.`
        : `You edited this ${noun} after pull request ${first(row)}. Select Update proposal to send the edits.`;
    case "draft":
      return deletion
        ? `Pull request ${first(row)} proposes deleting this ${noun} and is still a draft. Select View pull request to mark it ready for review.`
        : `Pull request ${first(row)} is a draft. Select View pull request to mark it ready for review.`;
    case "waiting-for-review":
      return deletion
        ? `Pull request ${first(row)} proposes deleting this ${noun} and is waiting for a reviewer.`
        : `Pull request ${first(row)} is open and waiting for a reviewer.`;
    case "changes-requested":
      return deletion
        ? `A reviewer asked for changes on the deletion in pull request ${first(row)}. Select Update proposal to send your changes.`
        : `A reviewer asked for changes on pull request ${first(row)}. Select Update proposal to send your changes.`;
    case "approved-awaiting-merge":
      return deletion
        ? `Pull request ${first(row)} proposes deleting this ${noun} and is approved. Select View pull request to merge it.`
        : `Pull request ${first(row)} is approved. Select View pull request to merge it.`;
    case "pull-request-missing":
      return "The proposal branch is on GitHub without a pull request. Select Create pull request to open one.";
    case "proposal-merged":
      return deletion
        ? `Pull request ${first(row)} merged the deletion. Select ${rereadLabel("Harness")} to read GitHub again.`
        : `Pull request ${first(row)} was merged. Select ${rereadLabel("Harness")} to read GitHub again.`;
    case "proposal-closed": {
      if (deletion && row.onDisk) {
        return `Pull request ${first(row)} was closed without merging. The ${ITEM_WORDS[row.type].holder} is back in your clone, so the ${noun} stays in the Harness.`;
      }
      // Only its author reopens it, so the menu offers no Reopen proposal.
      const [closed] = row.requests;
      return closed?.byOther === true
        ? phrase`${named(closed.author)}'s pull request ${first(row)} was closed without merging. Select ${PROPOSE_CHANGE} to send your own change.`
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
      return `Another contributor has pull request ${first(row)} open for this ${noun}. Wait until it is merged or closed.`;
    case "not-yet-released":
      return releaseSentence(row, release, publish);
  }
}

// The stage header already places the row in the next release (#1731).
function releaseSentence(
  row: HarnessStageRow,
  release: ReturnType<typeof machine> | null,
  publish: string,
): Copy {
  const noun = ITEM_WORDS[row.type].noun;
  const deletion = `Select ${CREATE_RELEASE} to publish the deletion.`;
  switch (row.change) {
    case "addition":
      return release === null
        ? `This ${noun} is in no release yet. ${publish}`
        : phrase`This ${noun} was added after release ${release}. ${publish}`;
    case "edit":
      return release === null
        ? `This ${noun} is in no release yet. ${publish}`
        : phrase`This ${noun} changed after release ${release}. ${publish}`;
    case "rename":
      return row.previousName === null
        ? `This ${noun} was renamed. ${publish}`
        : phrase`This ${noun} was renamed from ${named(row.previousName)}. ${publish}`;
    case "deletion":
      return release === null
        ? `This ${noun} was deleted. ${deletion}`
        : phrase`This ${noun} was deleted after release ${release}. ${deletion}`;
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
  return requested === null ? null : `Review requested from ${requested}.`;
};

export const pullRequestLinkName = (number: number): string =>
  `Pull request #${number}, opens in a new tab`;

// `into` stands in for the arrow between the branches, which is not read out.
export const PULL_REQUEST_CARD = {
  review: "Review",
  requested: "Requested",
  branch: BRANCH_FACT,
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
  ITEM_WORDS[row.type].deploys &&
  row.stage === "pending-proposal" &&
  row.change === "edit"
    ? `Deployed copies change only after a release and ${UPDATE_TARGET}.`
    : null;

// A merged change that is only wrong is corrected, not withdrawn (#1685).
const CORRECTION: Record<HarnessStageRow["type"], string> = {
  prompt: `To correct this change, select ${EDIT_PROMPT}.`,
  skill: `To correct this change, edit the deployed copy. Then select ${IMPORT_LOCAL_EDITS} on Deploy-state.`,
};

// A deleted prompt offers no Edit prompt; an added skill has no deployed copy.
const NO_CORRECTION: Record<HarnessStageRow["type"], HarnessChange> = {
  prompt: "deletion",
  skill: "addition",
};

export const correctionLine = (row: HarnessStageRow): string | null =>
  row.stage === "pending-release" && row.change !== NO_CORRECTION[row.type]
    ? CORRECTION[row.type]
    : null;

// Suppressed where any membership is unknown: "only here" is a claim, and an
// unread stage cannot back it.
export const crossStageLine = (row: HarnessStageRow): string | null => {
  if (row.alsoIn === null || row.alsoIn.length === 0) {
    return null;
  }
  return `Also in ${listOf(row.alsoIn.map((stage) => STAGE_NAMES[stage]))}.`;
};
