// Where "last successful fetch" lives. Not `.git/FETCH_HEAD`: git truncates
// that file and stamps it on a *failed* fetch too, so its age would report a
// failure as a success (measured on git 2.51, #516).
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

  async read(): Promise<HarnessFreshness> {
    const config = await this.store.read();
    return config.harnessFreshness ?? { outcome: null, lastFetchedAt: null };
  }

  async record(freshness: HarnessFreshness): Promise<void> {
    const config = await this.store.read();
    await this.store.write({ ...config, harnessFreshness: freshness });
  }
}
