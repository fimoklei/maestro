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
type BulkAttentionRow = { name: string; error: DeploySkillError };
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
      } else if (ATTENTION_ERRORS.has(result.error)) {
        attention.push({ name, error: result.error });
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

// Exactly the refusals a per-item force can override, so "attention" means a
// force is still available. Every other error is a genuine failure.
const ATTENTION_ERRORS: ReadonlySet<DeploySkillError> = new Set([
  "deployed-diverged-from-lock",
  "deployed-unverifiable",
]);
