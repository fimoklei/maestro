import type { GitHubPage } from "@maestro/core";

/** The connected Harness's facts band 2 states. */
export type HarnessFacts = {
  origin: string;
  github?: GitHubPage;
  /** Null where the Harness has no release. */
  latestRelease: string | null;
};

// Band 2 widths in rem, tuned in `pnpm smoke`: the labels go first, then
// Origin, Released and Skills, then the search becomes an icon, then the
// counts go; the dot and Read never drop.
export const LABELS_BELOW_REM = 66;
export const ORIGIN_DROP = { rank: 1, belowRem: 59 } as const;
export const RELEASED_DROP = { rank: 2, belowRem: 39 } as const;
export const SKILLS_DROP = { rank: 3, belowRem: 31 } as const;
export const SEARCH_ICON_BELOW_REM = 31;
export const COUNTS_BELOW_REM = 31;
