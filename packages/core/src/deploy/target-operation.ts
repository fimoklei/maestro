// The durable intent behind a write, for recovery only: never a second source
// of deployed truth (#951).
import type { ConfigStore } from "../registry/config-store";
import type { DeployTarget } from "./deploy-skill";
import type { SupportedTool } from "./deploy-tools";

export type TargetOperationKind = "deploy" | "remove" | "update";

export type TargetOperation = {
  // The target's lock key: the canonical repo path, or "global".
  key: string;
  target: DeployTarget;
  harness: string;
  kind: TargetOperationKind;
  release: string;
  previous: string[];
  desired: string[];
  // Null on the repo path, which always targets every DEPLOY_TOOLS tool.
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

  // Overwrites: the caller has already refused a second operation.
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
