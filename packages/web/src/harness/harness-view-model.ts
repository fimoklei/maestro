import type {
  HarnessFreshness,
  HarnessStage,
  HarnessStageRead,
  HarnessState,
} from "@maestro/core";
import { STAGE_NAMES } from "./stage-copy";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Fixed locale: the strip's date must not change shape with the browser's.
const dayAndMonth = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
});

// Null when the string is not a moment, so a hand-edited config reads as
// "never read" instead of throwing inside the date formatter (#516).
export const ago = (iso: string, now: Date): string | null => {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) {
    return null;
  }
  const elapsed = now.getTime() - at;
  if (elapsed < MINUTE) {
    return "just now";
  }
  if (elapsed < HOUR) {
    return `${Math.floor(elapsed / MINUTE)} min ago`;
  }
  if (elapsed < DAY) {
    return `${Math.floor(elapsed / HOUR)} h ago`;
  }
  return `on ${dayAndMonth.format(new Date(iso))}`;
};

// `on 20 Jul` reads as a date, `4 min ago` as a distance — both follow
// "Read", so the prefix is not repeated.
export const freshnessLabel = (
  freshness: HarnessFreshness,
  now: Date,
  reading = false,
): string => {
  // A read in flight outranks every dated reading: this slot is the only
  // feedback the author gets while one runs.
  if (reading) {
    return "Reading GitHub…";
  }
  const since =
    freshness.lastFetchedAt === null ? null : ago(freshness.lastFetchedAt, now);
  if (freshness.outcome === null) {
    return "Not read yet";
  }
  if (freshness.outcome === "fetched") {
    return since === null ? "Not read yet" : `Read ${since}`;
  }
  // A failure never claims a verdict GitHub has not given: no permission gate,
  // no expired-token guess (#516).
  const cause = freshness.outcome === "offline" ? "Offline" : "Read failed";
  return since === null
    ? `${cause} — never read`
    : `${cause} — last read ${since}`;
};

// The stage header's meta slot carries at most one reading, never two (#838),
// and never a routine read age: null where a successful read has nothing to name (#1218).
export type StageSection = {
  stage: HarnessStage;
  title: string;
  meta: string | null;
  read: HarnessStageRead;
};

// Which ref each row was compared against. More than one distinct answer, or a
// prepared proposal nobody opened a request for, and the slot names both
// possibilities instead of asserting a comparison that did not happen (#838).
const proposalMeta = (
  read: HarnessStageRead,
  state: HarnessState,
): string | null => {
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
  return refs.size === 1 && typeof only === "string"
    ? `Compared with ${only}`
    : `Compared with each skill's proposal or ${branch}`;
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

const releaseMeta = (read: HarnessStageRead, state: HarnessState): string => {
  if (read.outcome !== "read") {
    return "Status unknown";
  }
  return state.releasedVersion === null
    ? "Nothing released yet"
    : `Compared with ${state.releasedVersion}`;
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
export const harnessAnnouncement = (
  state: HarnessState,
  now: Date,
  reading = false,
): string => {
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
  return `${stages.join(" ")} ${freshnessLabel(state.freshness, now, reading)}.`;
};

// Only when every stage answered is "No changes yet" a fact.
export const journeyConfirmedEmpty = (state: HarnessState): boolean =>
  [state.stages.proposal, state.stages.review, state.stages.release].every(
    (stage) => stage.outcome === "read" && stage.rows.length === 0,
  );

// `offline` and `fetch-failed` are the two no-answer classes, and only they
// close Release: a plan off a picture the remote never answered for could
// publish a delta that has already moved (#519).
export const releaseEnabled = (freshness: HarnessFreshness): boolean =>
  freshness.outcome !== "offline" && freshness.outcome !== "fetch-failed";
