// Adds no remove semantics: every guard, the lock and the reclaim contract stay
// inside the single removal.
import type { DeployTarget } from "./deploy-skill";
import type {
  RemoveDeployedSkill,
  RemoveDeployedSkillError,
  RemoveOutcome,
  RemovePreflightError,
} from "./remove-deployed-skill";

// Each token and receipt belongs to this target's own preflight: one target's
// confirmation never licenses another's removal (#390, #458).
export type BulkRemoveTarget = {
  target: DeployTarget;
  confirmedReclaimToken?: string;
  confirmedRemovalReceipt?: string;
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
type BulkRemoveFailedRow = {
  target: DeployTarget;
  reason: RemoveDeployedSkillError;
  outcome?: RemoveOutcome;
};

// One row per target: identical reasons are never collapsed.
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

  // Sequential on purpose: the run must not contend with its own target lock.
  async execute(input: BulkRemoveInput): Promise<BulkRemoveReport> {
    const removed: BulkRemovedRow[] = [];
    const refused: BulkRemoveRefusedRow[] = [];
    const failed: BulkRemoveFailedRow[] = [];

    for (const entry of input.targets) {
      if (entry.refused !== undefined) {
        refused.push({ target: entry.target, reason: entry.refused });
        continue;
      }

      let result: Awaited<ReturnType<RemoveDeployedSkill["execute"]>>;
      try {
        result = await this.deps.remove.execute({
          type: "skill",
          name: input.name,
          target: entry.target,
          confirmedReclaimToken: entry.confirmedReclaimToken,
          confirmedRemovalReceipt: entry.confirmedRemovalReceipt,
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
