// Every fetch of the Harness clone goes through here: two fetches race over
// the same git refs.
import { ReuseGate } from "../reuse-gate";
import type {
  HarnessFetchOutcome,
  HarnessFreshnessPort,
  HarnessGitPort,
} from "./read-harness-state";
import { recordFetch } from "./record-fetch";

const RECENT_MAX_AGE_MS = 30_000;

export class HarnessFetchGate {
  private readonly deps: {
    git: Pick<HarnessGitPort, "fetch" | "catchUp">;
    freshness: HarnessFreshnessPort;
    now: () => Date;
    fetched: (root: string) => void;
  };
  private readonly gate: ReuseGate<HarnessFetchOutcome>;

  constructor(deps: HarnessFetchGate["deps"]) {
    this.deps = deps;
    this.gate = new ReuseGate({ now: deps.now, keep: () => true });
  }

  fetchFresh(resolvedRoot: string): Promise<HarnessFetchOutcome> {
    return this.fetch(resolvedRoot, 0);
  }

  fetchRecent(resolvedRoot: string): Promise<HarnessFetchOutcome> {
    return this.fetch(resolvedRoot, RECENT_MAX_AGE_MS);
  }

  invalidate(resolvedRoot: string): void {
    this.gate.invalidate(resolvedRoot);
  }

  private fetch(
    resolvedRoot: string,
    maxAgeMs: number,
  ): Promise<HarnessFetchOutcome> {
    return this.gate.run(resolvedRoot, maxAgeMs, async () => {
      let outcome: HarnessFetchOutcome;
      try {
        outcome = await recordFetch(this.deps, resolvedRoot, this.deps.now());
      } finally {
        this.deps.fetched(resolvedRoot);
      }
      await this.deps.git.catchUp(resolvedRoot);
      return outcome;
    });
  }
}
