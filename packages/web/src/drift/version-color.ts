import type { DriftStatus } from "./drift-view-model";

// The deployed version's colour by drift: amber when behind (shown as the
// deployed -> latest pair), green when up-to-date, neutral for every un-run state
// so "we don't know" never reads as in sync (ADR-0007, J04). One owner, shared by
// the target-first deploy-state list and the inventory detail pane, so the two
// surfaces can never drift apart on the scheme.
export const versionColor: Record<DriftStatus, string> = {
  behind: "text-amber-ink",
  "up-to-date": "text-green-ink",
  unknown: "text-muted",
  unverified: "text-muted",
  pending: "text-muted",
};
