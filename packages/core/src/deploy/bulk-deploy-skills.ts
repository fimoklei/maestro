// Adds no deploy semantics: hands every name to DeploySkill's one batch and
// groups what it answered (#292, #1039).
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
// `forceable` keeps the offer honest: a per-item force clears only a
// not-proven-clean refusal (#358).
type BulkAttentionRow = {
  name: string;
  error: DeploySkillError;
  forceable: boolean;
  // The receipt this row's own refusal minted, so the row's inline deploy
  // grants exactly what that refusal read and nothing else (#952).
  copyReceipt?: string;
};
// `linkedPath` is Maestro's own reading of the link apm refused (ADR-0018).
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
    // Keyed by error (and link) so identical failures collapse to one line, in
    // first-seen order, without losing which skills hit them.
    const failures = new Map<string, BulkFailure>();

    // Caught here too, so an unexpected exception still answers every name
    // with a typed error rather than aborting the report (#292).
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
  // A deploy, removal or update already holds this target's lock. Nothing
  // went wrong; the reader waits (spec story 51).
  "deploy-in-progress": { forceable: false },
  "manifest-not-recognised": { forceable: false },
  "operation-unfinished": { forceable: false },
};
