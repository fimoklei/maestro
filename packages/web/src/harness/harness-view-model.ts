import type {
  HarnessFreshness,
  HarnessStage,
  HarnessStageRead,
  HarnessState,
} from "@maestro/core";
import { freshnessLine } from "../ui/freshness";
import { type Copy, machine, phrase } from "../ui/phrase";
import { CREATE_RELEASE_UNAVAILABLE } from "./dialog-copy";
import { defaultBranchCopy, STAGE_NAMES } from "./stage-copy";

// The stage header's meta slot carries at most one reading, never two (#838),
// and never a routine read age: null where a successful read has nothing to name (#1218).
export type StageSection = {
  stage: HarnessStage;
  title: string;
  meta: Copy | null;
  read: HarnessStageRead;
};

// Which ref each row was compared against. More than one distinct answer, or a
// prepared proposal nobody opened a request for, and the slot names both
// possibilities instead of asserting a comparison that did not happen (#838).
const proposalMeta = (
  read: HarnessStageRead,
  state: HarnessState,
): Copy | null => {
  if (read.outcome !== "read") {
    return "Status unknown";
  }
  if (read.rows.length === 0) {
    return null;
  }
  const branch = state.defaultBranch ?? "the default branch";
  // Null for a prepared proposal with no request to name: it has no reading of
  // its own, so it falls to the mixed one below rather than inventing a ref.
  const refs = new Set(
    read.rows.map((row) =>
      row.comparison?.kind === "proposal"
        ? row.comparison.number === null
          ? null
          : `pull request #${row.comparison.number}`
        : branch,
    ),
  );
  const [only] = [...refs];
  const branchValue = defaultBranchCopy(state.defaultBranch);
  if (refs.size === 1 && typeof only === "string") {
    return only === branch
      ? phrase`Compared with ${branchValue}`
      : `Compared with ${only}`;
  }
  return phrase`Compared with each skill's proposal or ${branchValue}`;
};

const reviewMeta = (read: HarnessStageRead): string | null => {
  if (read.outcome === "unavailable") {
    return "Review status unavailable";
  }
  if (read.outcome === "unknown") {
    return "Review status unknown";
  }
  // A read that filled its bound names it: it saw that much and no more.
  return read.bound === null
    ? null
    : `Read the ${read.bound} most recent pull requests`;
};

const releaseMeta = (read: HarnessStageRead, state: HarnessState): Copy => {
  if (read.outcome !== "read") {
    return "Status unknown";
  }
  return state.releasedVersion === null
    ? "Not released yet"
    : phrase`Compared with ${machine(state.releasedVersion)}`;
};

// The three stages in journey order. A confirmed empty stage still comes back;
// the view drops it.
export const stageSections = (state: HarnessState): StageSection[] =>
  [
    {
      stage: "pending-proposal" as const,
      read: state.stages.proposal,
      meta: proposalMeta(state.stages.proposal, state),
    },
    {
      stage: "pending-review" as const,
      read: state.stages.review,
      meta: reviewMeta(state.stages.review),
    },
    {
      stage: "pending-release" as const,
      read: state.stages.release,
      meta: releaseMeta(state.stages.release, state),
    },
  ].map((section) => ({ ...section, title: STAGE_NAMES[section.stage] }));

// Counts, never statuses: the row itself states why it is where it is (#868).
export const harnessAnnouncement = (state: HarnessState, now: Date): string => {
  const stages = stageSections(state).map((section) => {
    if (section.read.outcome !== "read") {
      return `${section.title} was not read.`;
    }
    const count = section.read.rows.length;
    if (count === 0) {
      return `${section.title} has no changes.`;
    }
    return `${section.title} has ${count} change${count === 1 ? "" : "s"}.`;
  });
  const line = freshnessLine(
    {
      readAt: [state.freshness.lastFetchedAt],
      outcome: state.freshness.outcome,
    },
    now,
  );
  return `${stages.join(" ")} ${line}.`;
};

// `offline` and `fetch-failed` are the two no-answer classes, and only they
// close Release: a plan off a picture the remote never answered for could
// publish a delta that has already moved (#519).
export const releaseEnabled = (freshness: HarnessFreshness): boolean =>
  freshness.outcome !== "offline" && freshness.outcome !== "fetch-failed";

/** Why Create a release cannot open its plan now; null when it can. */
export const releaseUnavailable = (
  freshness: HarnessFreshness,
  rereading: boolean,
): string | null =>
  rereading
    ? CREATE_RELEASE_UNAVAILABLE.rereading
    : releaseEnabled(freshness)
      ? null
      : CREATE_RELEASE_UNAVAILABLE.notRead;
