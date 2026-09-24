import type { DriftStatus } from "./drift-view-model";

// Neutral for every un-run state, so "we don't know" never reads as in sync
// (J04). One owner, shared by the deploy-state list and the inventory pane.
export const versionColor: Record<DriftStatus, string> = {
  behind: "text-amber-11",
  // Muted, not amber: the pin lags but nothing in the skill changed (ADR-0027).
  "older-tag": "text-gray-11",
  "no-longer-released": "text-amber-11",
  "up-to-date": "text-green-11",
  unknown: "text-gray-11",
  unverified: "text-gray-11",
  pending: "text-gray-11",
};
