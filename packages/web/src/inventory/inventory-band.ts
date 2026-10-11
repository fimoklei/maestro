import type { GitHubPage } from "@maestro/core";
import type { Freshness } from "../ui/freshness";

/** The connected Harness's facts band 2 states. */
export type HarnessFacts = {
  origin: string;
  github?: GitHubPage;
  /** Null where the Harness has no release. */
  latestRelease: string | null;
};

/** One reading behind the rows: when it last answered, in epoch ms (null: never), and whether its latest attempt failed. */
export type Reading = { at: number | null; failed: boolean };

/** A query's reading; its `dataUpdatedAt` stays 0 until it first answers. */
export const queryReading = (query: {
  dataUpdatedAt: number;
  isError: boolean;
}): Reading => ({
  at: query.dataUpdatedAt === 0 ? null : query.dataUpdatedAt,
  failed: query.isError,
});

// The oldest reading dates the line, and one that never answered is the
// oldest of all; a failed reading turns it into the failed-read words.
export const readFreshness = (reads: readonly Reading[]): Freshness => {
  const ats = reads.map((each) => each.at);
  return {
    readAt: ats.includes(null) ? [] : ats,
    outcome: reads.some((each) => each.failed) ? "fetch-failed" : "fetched",
  };
};

// Band 2 widths in rem, tuned in `pnpm smoke`: the labels go first, then
// Origin, Released and Skills, then the search becomes an icon, then the
// counts go; the dot and Read never drop.
export const LABELS_BELOW_REM = 66;
export const ORIGIN_DROP = { rank: 1, belowRem: 59 } as const;
export const RELEASED_DROP = { rank: 2, belowRem: 39 } as const;
export const SKILLS_DROP = { rank: 3, belowRem: 31 } as const;
export const SEARCH_ICON_BELOW_REM = 31;
export const COUNTS_BELOW_REM = 22;
