// Adds no deploy semantics: drives DeploySkill once per name and harvests the
// results, so one failure never aborts the batch (#292).
import type {
  DeploySkill,
  DeploySkillError,
  DeployTarget,
} from "./deploy-skill";

// No batch-wide force: force stays per-item, on the single-deploy route (#292).
export type BulkDeployInput = {
  names: string[];
  target: DeployTarget;
};

type BulkDeployedRow = { name: string; version: string };
// `forceable` keeps the offer honest: a per-item force clears a not-proven-clean
// refusal, but re-running the same install over an unsupported package type only
// records it again (#358).
type BulkAttentionRow = {
  name: string;
  error: DeploySkillError;
  packageType?: string;
  forceable: boolean;
  // The receipt this row's own refusal minted, so the row's inline deploy
  // grants exactly what that refusal read and nothing else (#952).
  copyReceipt?: string;
};
type BulkFailure = { error: DeploySkillError; names: string[] };

export type BulkDeployReport = {
  target: DeployTarget;
  deployed: BulkDeployedRow[];
  attention: BulkAttentionRow[];
  failed: BulkFailure[];
};

export class BulkDeploySkills {
  constructor(
    private readonly deps: { deploy: Pick<DeploySkill, "execute"> },
  ) {}

  async execute(input: BulkDeployInput): Promise<BulkDeployReport> {
    const deployed: BulkDeployedRow[] = [];
    const attention: BulkAttentionRow[] = [];
    // Keyed by error so identical failures collapse to one line, in first-seen
    // order, without losing which skills hit them.
    const failures = new Map<DeploySkillError, string[]>();

    for (const name of input.names) {
      // Caught here too, so one name's unexpected exception never aborts the
      // rest of the batch (#292).
      let result: Awaited<ReturnType<DeploySkill["execute"]>>;
      try {
        result = await this.deps.deploy.execute({
          type: "skill",
          name,
          target: input.target,
        });
      } catch {
        result = { ok: false, error: "deploy-failed" };
      }
      if (result.ok) {
        deployed.push({ name, version: result.deployed.version });
      } else if (ATTENTION[result.error]) {
        attention.push({
          name,
          error: result.error,
          ...(result.packageType ? { packageType: result.packageType } : {}),
          ...(result.copyReceipt ? { copyReceipt: result.copyReceipt } : {}),
          forceable: ATTENTION[result.error]?.forceable ?? false,
        });
      } else {
        const names = failures.get(result.error) ?? [];
        names.push(name);
        failures.set(result.error, names);
      }
    }

    const failed: BulkFailure[] = [...failures].map(([error, names]) => ({
      error,
      names,
    }));

    return { target: input.target, deployed, attention, failed };
  }
}

// One owner for both readings: a refusal the user acts on, and whether a force
// is the action (ADR-0006). Every error absent here is a genuine failure.
const ATTENTION: Partial<Record<DeploySkillError, { forceable: boolean }>> = {
  "deployed-diverged-from-lock": { forceable: true },
  "deployed-unverifiable": { forceable: true },
  // A bulk deploy never moves a target's release and never grants consent for
  // the reader, so each of these is a row to read, not a row to force
  // (ADR-0031, #951).
  "not-at-target-release": { forceable: false },
  "target-pinned-per-skill": { forceable: false },
  "manifest-not-recognised": { forceable: false },
  "operation-unfinished": { forceable: false },
};
