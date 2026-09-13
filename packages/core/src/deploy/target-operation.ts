// The durable intent behind a write: what Maestro set out to do to one target,
// written before the first mutation and cleared only once disk, the manifest
// and the deployment record agree with it. It records intent for recovery,
// never a second source of deployed truth (ADR-0031, #951).
import type { ConfigStore } from "../registry/config-store";
import type { DeployTarget } from "./deploy-skill";
import type { SupportedTool } from "./deploy-tools";

export type TargetOperationKind = "deploy" | "remove" | "update";

export type TargetOperation = {
  // The target's lock key: the canonical repo path, or "global". One
  // operation per key, so a second one cannot start beside an unfinished one.
  key: string;
  target: DeployTarget;
  harness: string;
  kind: TargetOperationKind;
  release: string;
  previous: string[];
  desired: string[];
  // The detected tools the write ran against; null on the repo path, which
  // always targets every DEPLOY_TOOLS tool.
  tools: SupportedTool[] | null;
  startedAt: string;
};

export class TargetOperationStore {
  private readonly store: ConfigStore;
  private readonly now: () => Date;

  constructor(deps: { store: ConfigStore; now?: () => Date }) {
    this.store = deps.store;
    this.now = deps.now ?? (() => new Date());
  }

  async read(key: string): Promise<TargetOperation | null> {
    const records = (await this.store.read()).targetOperations ?? [];
    return (records.find((record) => record.key === key) ??
      null) as TargetOperation | null;
  }

  // Overwrites: one target holds at most one unfinished operation, and the
  // caller has already refused a second one.
  async begin(
    operation: Omit<TargetOperation, "startedAt">,
  ): Promise<TargetOperation> {
    const record: TargetOperation = {
      ...operation,
      startedAt: this.now().toISOString(),
    };
    await this.store.update((config) => ({
      config: {
        ...config,
        targetOperations: [
          ...(config.targetOperations ?? []).filter(
            (existing) => existing.key !== operation.key,
          ),
          record,
        ],
      },
    }));
    return record;
  }

  async clear(key: string): Promise<void> {
    await this.store.update((config) => ({
      config: {
        ...config,
        targetOperations: (config.targetOperations ?? []).filter(
          (record) => record.key !== key,
        ),
      },
    }));
  }
}
