// Turns the Harness state the server sends into the two sentences the home
// base shows. Pure and clock-injected, so the age is testable.
import type { HarnessFreshness, HarnessReleaseState } from "./use-harness";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Fixed locale: the strip's date must not change shape with the browser's.
const dayAndMonth = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
});

const ago = (iso: string, now: Date): string => {
  const elapsed = now.getTime() - Date.parse(iso);
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
  if (freshness.outcome === null) {
    return "Not fetched yet";
  }
  if (freshness.outcome === "fetched" && freshness.lastFetchedAt !== null) {
    return `Fetched ${ago(freshness.lastFetchedAt, now)}`;
  }
  // A failure never claims a verdict GitHub has not given: no permission gate,
  // no expired-token guess (ADR-0021, #516).
  const cause = freshness.outcome === "offline" ? "Offline" : "Fetch failed";
  return freshness.lastFetchedAt === null
    ? `${cause} — never fetched`
    : `${cause} — last fetched ${ago(freshness.lastFetchedAt, now)}`;
};

export const RELEASE_SUMMARIES: Record<HarnessReleaseState, string> = {
  released: "Everything merged is released.",
  "pending-release": "Merged changes are waiting for release.",
  "never-released": "No release yet.",
  unknown: "Not fetched yet, so what is waiting is unknown.",
};
