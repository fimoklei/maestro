// Turns the Harness state the server sends into the two sentences the home
// base shows. Pure and clock-injected, so the age is testable.

import { STAGE_NAMES } from "./stage-copy";
import type {
  HarnessFreshness,
  HarnessStage,
  HarnessStageRead,
  HarnessState,
} from "./use-harness";

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
  // no expired-token guess (ADR-0021, #516).
  const cause = freshness.outcome === "offline" ? "Offline" : "Read failed";
  return since === null
    ? `${cause} — never read`
    : `${cause} — last read ${since}`;
};

// The stage header's meta slot carries exactly one reading, never two: either
// what was compared and when, or the label that replaces the whole slot when
// the stage was not read (#827 — Screen design; decision #838).
export type StageSection = {
  stage: HarnessStage;
  title: string;
  meta: string;
  read: HarnessStageRead;
};

// "4 min ago", or null when no read has ever succeeded — then the slot names
// what was compared and stops, rather than dating a read that never happened.
const readAge = (freshness: HarnessFreshness, now: Date): string | null =>
  freshness.lastFetchedAt === null ? null : ago(freshness.lastFetchedAt, now);

const withAge = (what: string, since: string | null): string =>
  since === null ? what : `${what}, read ${since}`;

// Which ref each row was compared against. More than one distinct answer, or a
// prepared proposal nobody opened a request for, and the slot names both
// possibilities instead of asserting a comparison that did not happen (#838).
const proposalMeta = (
  read: HarnessStageRead,
  state: HarnessState,
  since: string | null,
): string => {
  if (read.outcome !== "read") {
    return "Status unknown";
  }
  if (read.rows.length === 0) {
    return since === null ? "Not read yet" : `Read ${since}`;
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
    ? withAge(`Compared with ${only}`, since)
    : withAge(`Compared with each skill's proposal or ${branch}`, since);
};

const reviewMeta = (read: HarnessStageRead, since: string | null): string => {
  if (read.outcome === "unavailable") {
    return "Review status unavailable";
  }
  if (read.outcome === "unknown") {
    return "Review status unknown";
  }
  // A read that filled its bound names it: it saw that much and no more. The
  // sentence already says "Read", so the age joins it without withAge's verb.
  if (read.bound !== null) {
    const bounded = `Read the ${read.bound} most recent pull requests`;
    return since === null ? bounded : `${bounded}, ${since}`;
  }
  return since === null ? "Not read yet" : `Read from GitHub ${since}`;
};

const releaseMeta = (
  read: HarnessStageRead,
  state: HarnessState,
  since: string | null,
): string => {
  if (read.outcome !== "read") {
    return "Status unknown";
  }
  return withAge(
    state.releasedVersion === null
      ? "Nothing released yet"
      : `Compared with ${state.releasedVersion}`,
    since,
  );
};

// The three stages in journey order. A confirmed empty stage still comes back:
// the view drops it, except Pending proposal, which hosts Import skill…
export const stageSections = (
  state: HarnessState,
  now: Date,
): StageSection[] => {
  const since = readAge(state.freshness, now);
  return [
    {
      stage: "pending-proposal" as const,
      read: state.stages.proposal,
      meta: proposalMeta(state.stages.proposal, state, since),
    },
    {
      stage: "pending-review" as const,
      read: state.stages.review,
      meta: reviewMeta(state.stages.review, since),
    },
    {
      stage: "pending-release" as const,
      read: state.stages.release,
      meta: releaseMeta(state.stages.release, state, since),
    },
  ].map((section) => ({ ...section, title: STAGE_NAMES[section.stage] }));
};

// What the three stages hold, in the words a screen reader hears when a press
// moves a row between them or a refresh re-dates the picture (#868). Counts,
// never statuses: the row itself states why it is where it is.
export const harnessAnnouncement = (
  state: HarnessState,
  now: Date,
  reading = false,
): string => {
  const stages = stageSections(state, now).map((section) => {
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

// Nothing anywhere, and every stage answered for itself. Only then is "No
// changes yet" a fact rather than a picture nobody could read.
export const journeyConfirmedEmpty = (state: HarnessState): boolean =>
  [state.stages.proposal, state.stages.review, state.stages.release].every(
    (stage) => stage.outcome === "read" && stage.rows.length === 0,
  );

// `offline` and `fetch-failed` are the two no-answer classes, and only they
// close Release: a plan off a picture the remote never answered for could
// publish a delta that has already moved (#519).
export const releaseEnabled = (freshness: HarnessFreshness): boolean =>
  freshness.outcome !== "offline" && freshness.outcome !== "fetch-failed";
