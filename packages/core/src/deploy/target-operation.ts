import type { ConfigStore, MaestroConfig } from "../registry/config-store";

export type TargetOperation = NonNullable<
  MaestroConfig["targetOperations"]
>[number];

export type TargetOperationKind = TargetOperation["kind"];

export class TargetOperationStore {
  private readonly store: ConfigStore;
  private readonly now: () => Date;

  constructor(deps: { store: ConfigStore; now?: () => Date }) {
    this.store = deps.store;
    this.now = deps.now ?? (() => new Date());
  }

  async read(key: string): Promise<TargetOperation | null> {
    const records = (await this.store.read()).targetOperations ?? [];
    return records.find((record) => record.key === key) ?? null;
  }

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
