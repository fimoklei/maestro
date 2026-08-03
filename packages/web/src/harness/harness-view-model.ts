// Turns the Harness state the server sends into the two sentences the home
// base shows. Pure and clock-injected, so the age is testable.
import type {
  HarnessFreshness,
  HarnessMovement,
  HarnessReleaseState,
  MovementState,
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
// "never fetched" instead of throwing inside the date formatter (#516).
const ago = (iso: string, now: Date): string | null => {
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
// "Fetched", so the prefix is not repeated.
export const freshnessLabel = (
  freshness: HarnessFreshness,
  now: Date,
): string => {
  const since =
    freshness.lastFetchedAt === null ? null : ago(freshness.lastFetchedAt, now);
  if (freshness.outcome === null) {
    return "Not fetched yet";
  }
  if (freshness.outcome === "fetched") {
    return since === null ? "Not fetched yet" : `Fetched ${since}`;
  }
  // A failure never claims a verdict GitHub has not given: no permission gate,
  // no expired-token guess (ADR-0021, #516).
  const cause = freshness.outcome === "offline" ? "Offline" : "Fetch failed";
  return since === null
    ? `${cause} — never fetched`
    : `${cause} — last fetched ${since}`;
};

// One section per state, in the order the route runs backwards: what is waiting
// on the team, then what has not left this disk. The section names the state,
// so no row has to repeat it (#347).
const MOVEMENT_SECTIONS = [
  {
    state: "pending-review",
    title: "Pending review",
    meta: "Pushed, waiting for input",
  },
  {
    state: "pending-promotion",
    title: "Pending promotion",
    meta: "local on disk",
  },
] as const satisfies readonly {
  state: MovementState;
  title: string;
  meta: string;
}[];

// An empty section is absent rather than shown empty, so a quiet harness reads
// as an answer instead of a form with nothing in it.
export const movementSections = (movements: HarnessMovement[]) =>
  MOVEMENT_SECTIONS.map((section) => ({
    ...section,
    movements: movements.filter((movement) => movement.state === section.state),
  })).filter((section) => section.movements.length > 0);

export const RELEASE_SUMMARIES: Record<HarnessReleaseState, string> = {
  released: "Everything merged is released.",
  "pending-release": "Merged changes are waiting for release.",
  "never-released": "No release yet.",
  unknown: "Not fetched yet, so what is waiting is unknown.",
};
