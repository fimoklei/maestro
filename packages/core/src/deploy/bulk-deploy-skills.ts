// Bulk-deploy the staged skills to one target. This adds no deploy semantics: it
// drives the existing per-skill DeploySkill (with its guards) once per name and
// folds the results into a plan/report. Continue-and-harvest — a single failure
// never aborts the batch — and identical failures collapse into one line.
import type {
  DeploySkill,
  DeploySkillError,
  DeployTarget,
} from "./deploy-skill";

export type BulkDeployInput = {
  names: string[];
  target: DeployTarget;
  force?: boolean;
};

export type BulkDeployedRow = { name: string; version: string };
export type BulkAttentionRow = { name: string; error: DeploySkillError };
export type BulkFailure = { error: DeploySkillError; names: string[] };

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
    // Preserve first-seen order of failure codes, each holding the names it hit,
    // so identical failures collapse to one line without losing which skills.
    const failures = new Map<DeploySkillError, string[]>();

    for (const name of input.names) {
      const result = await this.deps.deploy.execute({
        type: "skill",
        name,
        target: input.target,
        force: input.force,
      });
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

// The refusals a per-item force can override: the deployed copy diverged from
// its lockfile, or it exists but carries no recorded hashes to verify against.
// DeploySkill re-runs both when force is set, so a bulk run surfaces them as
// "attention" (a force stays available) rather than a hard failure — matching
// its force semantics exactly. Every other error is a genuine failure.
const ATTENTION_ERRORS: ReadonlySet<DeploySkillError> = new Set([
  "deployed-diverged-from-lock",
  "deployed-unverifiable",
]);
