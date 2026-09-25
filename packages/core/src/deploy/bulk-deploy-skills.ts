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
type BulkAttentionRow = {
  name: string;
  error: DeploySkillError;
  forceable: boolean;
  // Minted by this row's own refusal; grants only what that refusal read (#952).
  copyReceipt?: string;
};
type BulkFailure = {
  error: DeploySkillError;
  names: string[];
  linkedPath?: string;
};

export type BulkDeployReport = {
  target: DeployTarget;
  deployed: BulkDeployedRow[];
  attention: BulkAttentionRow[];
  failed: BulkFailure[];
};

export class BulkDeploySkills {
  constructor(
    private readonly deps: { deploy: Pick<DeploySkill, "executeBatch"> },
  ) {}

  async execute(input: BulkDeployInput): Promise<BulkDeployReport> {
    const deployed: BulkDeployedRow[] = [];
    const attention: BulkAttentionRow[] = [];
    // Keyed by error and link, so identical failures collapse to one line.
    const failures = new Map<string, BulkFailure>();

    let rows: Awaited<ReturnType<DeploySkill["executeBatch"]>>;
    try {
      rows = await this.deps.deploy.executeBatch({
        names: input.names,
        target: input.target,
      });
    } catch {
      rows = input.names.map((name) => ({
        name,
        result: { ok: false, error: "deploy-failed" },
      }));
    }

    for (const { name, result } of rows) {
      if (result.ok) {
        deployed.push({ name, version: result.deployed.version });
      } else if (ATTENTION[result.error]) {
        attention.push({
          name,
          error: result.error,
          ...(result.copyReceipt ? { copyReceipt: result.copyReceipt } : {}),
          forceable: ATTENTION[result.error]?.forceable ?? false,
        });
      } else {
        const key = `${result.error}\0${result.linkedPath ?? ""}`;
        const line = failures.get(key) ?? {
          error: result.error,
          names: [],
          ...(result.linkedPath ? { linkedPath: result.linkedPath } : {}),
        };
        line.names.push(name);
        failures.set(key, line);
      }
    }

    return {
      target: input.target,
      deployed,
      attention,
      failed: [...failures.values()],
    };
  }
}

// Refusals the user acts on, and whether a force is the action. Every error
// absent here is a genuine failure.
const ATTENTION: Partial<Record<DeploySkillError, { forceable: boolean }>> = {
  "deployed-diverged-from-lock": { forceable: true },
  "deployed-unverifiable": { forceable: true },
  "not-at-target-release": { forceable: false },
  "target-pinned-per-skill": { forceable: false },
  "deploy-in-progress": { forceable: false },
  "manifest-not-recognised": { forceable: false },
  "operation-unfinished": { forceable: false },
};
