import type { DeployedPrimitive } from "../deploy-state/use-deploy-state";
import { type DriftView, skillDriftStatus } from "./drift-status";

export type SyncedState = "synced" | "not-synced";

// A target is only "already synced" when both independent reads prove it:
// deploy-state contains the skill and drift says that exact skill is current.
// Every missing, pending, or failed read deliberately falls back to an action.
export const deriveSyncedState = (
  deployed: DeployedPrimitive[] | undefined,
  drift: DriftView,
  skillName: string,
): SyncedState => {
  if (!deployed?.some((primitive) => primitive.name === skillName)) {
    return "not-synced";
  }

  return skillDriftStatus(skillName, drift) === "up-to-date"
    ? "synced"
    : "not-synced";
};
