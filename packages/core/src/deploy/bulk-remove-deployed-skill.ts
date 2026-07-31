// Adds no remove semantics: drives RemoveDeployedSkill once per target and
// harvests the results, so one target never aborts the batch (#421). Every
// guard, the lock and the reclaim contract stay inside the single removal.
import type { DeployTarget } from "./deploy-skill";
import type {
  RemoveDeployedSkill,
  RemoveDeployedSkillError,
  RemoveOutcome,
  RemovePreflightError,
} from "./remove-deployed-skill";

export type BulkRemoveTarget = {
  target: DeployTarget;
  // Minted by this target's own preflight; the walk forwards it untouched so a
  // global removal reclaims exactly the copies the user confirmed (#390).
  confirmedReclaimToken?: string;
  // Set when this target's own preflight already refused it. Skipped rather
  // than attempted, so a bulk run never retries a question already answered.
  refused?: RemovePreflightError;
};

export type BulkRemoveInput = {
  name: string;
  targets: readonly BulkRemoveTarget[];
};

type BulkRemovedRow = { target: DeployTarget; version: string };
type BulkRemoveRefusedRow = {
  target: DeployTarget;
  reason: RemovePreflightError;
};
// `outcome` is present only where apm ran and left something to probe, exactly
// as on a single removal: an absent key is never a state the server proved.
type BulkRemoveFailedRow = {
  target: DeployTarget;
  reason: RemoveDeployedSkillError;
  outcome?: RemoveOutcome;
};

// Every left-alone target keeps its own row: "why was this one left" is a
// per-target question, so identical reasons are never collapsed.
export type BulkRemoveReport = {
  name: string;
  removed: BulkRemovedRow[];
  refused: BulkRemoveRefusedRow[];
  failed: BulkRemoveFailedRow[];
};

export class BulkRemoveDeployedSkill {
  constructor(
    private readonly deps: { remove: Pick<RemoveDeployedSkill, "execute"> },
  ) {}

  // Sequential on purpose: the run must not contend with its own per-target
  // lock, and a target held elsewhere comes back as a failure row like any
  // other.
  async execute(input: BulkRemoveInput): Promise<BulkRemoveReport> {
    const removed: BulkRemovedRow[] = [];
    const refused: BulkRemoveRefusedRow[] = [];
    const failed: BulkRemoveFailedRow[] = [];

    for (const entry of input.targets) {
      if (entry.refused !== undefined) {
        refused.push({ target: entry.target, reason: entry.refused });
        continue;
      }

      // Caught here too, so one target's unexpected exception never aborts the
      // rest of the batch (#421).
      let result: Awaited<ReturnType<RemoveDeployedSkill["execute"]>>;
      try {
        result = await this.deps.remove.execute({
          type: "skill",
          name: input.name,
          target: entry.target,
          confirmedReclaimToken: entry.confirmedReclaimToken,
        });
      } catch {
        result = { ok: false, error: "remove-failed" };
      }

      if (result.ok) {
        removed.push({
          target: entry.target,
          version: result.removed.version,
        });
      } else {
        failed.push({
          target: entry.target,
          reason: result.error,
          ...(result.outcome ? { outcome: result.outcome } : {}),
        });
      }
    }

    return { name: input.name, removed, refused, failed };
  }
}
