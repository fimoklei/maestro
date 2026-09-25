// Not `.git/FETCH_HEAD`: git stamps it on a failed fetch too (git 2.51, #516).
import type { ConfigStore } from "../registry/config-store";
import type {
  HarnessFreshness,
  HarnessFreshnessPort,
} from "./read-harness-state";

export class HarnessFreshnessStore implements HarnessFreshnessPort {
  private readonly store: ConfigStore;

  constructor(deps: { store: ConfigStore }) {
    this.store = deps.store;
  }

  // A record left by another root reads as never fetched.
  async read(root: string): Promise<HarnessFreshness> {
    const record = (await this.store.read()).harnessFreshness;
    return record === undefined || record.root !== root
      ? { outcome: null, lastFetchedAt: null }
      : { outcome: record.outcome, lastFetchedAt: record.lastFetchedAt };
  }

  async record(root: string, freshness: HarnessFreshness): Promise<void> {
    await this.store.update((config) => ({
      config: { ...config, harnessFreshness: { root, ...freshness } },
    }));
  }
}
