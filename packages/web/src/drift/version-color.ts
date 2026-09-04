import type { DriftStatus } from "./drift-view-model";

// Neutral for every un-run state, so "we don't know" never reads as in sync
// (J04). One owner, shared by the deploy-state list and the inventory pane.
export const versionColor: Record<DriftStatus, string> = {
  behind: "text-amber-ink",
  // Muted, not amber: the pin lags but nothing in the skill changed (ADR-0027).
  "older-tag": "text-muted",
  "up-to-date": "text-green-ink",
  unknown: "text-muted",
  unverified: "text-muted",
  pending: "text-muted",
};
