import type { FolderOutcomes } from "@maestro/core";
import type { BulkDeployPlan } from "./plan-bulk-deploy";

/** A skill at the release a run deployed. */
export type SkillRelease = { name: string; version: string };

/** Where Deploy skills stands once a target is chosen. */
export type BulkDeployRunState =
  | { phase: "choosing" }
  | {
      phase: "ran";
      plan: BulkDeployPlan;
      /** The Attention rows Deploy again has since deployed: they read as Deployed. */
      redeployed: SkillRelease[];
      /** The Global folders as the latest row's Deploy again read them back. */
      reread: FolderOutcomes | null;
    }
  | {
      /** Update target takes the dialog's place, priced with this skill (#955). */
      phase: "updating";
      add: string;
    };

export const ranWith = (plan: BulkDeployPlan): BulkDeployRunState => ({
  phase: "ran",
  plan,
  redeployed: [],
  reread: null,
});

// A row's Deploy again that lands once the run is left changes nothing.
export function redeployedIn(
  run: BulkDeployRunState,
  row: SkillRelease,
  outcome: FolderOutcomes | undefined,
): BulkDeployRunState {
  if (run.phase !== "ran") return run;
  return {
    ...run,
    redeployed: [...run.redeployed, row],
    reread: outcome ?? run.reread,
  };
}
