// Every fetch of the Harness clone goes through here: two fetches race over
// the same git refs. Key it on the resolved root, never the configured path.
import { ReuseGate } from "../reuse-gate";
import type {
  HarnessFetchOutcome,
  HarnessFreshnessPort,
  HarnessGitPort,
} from "./read-harness-state";
import { recordFetch } from "./record-fetch";

// How old a fetch a recent read may reuse.
const RECENT_MAX_AGE_MS = 30_000;

export class HarnessFetchGate {
  private readonly deps: {
    git: Pick<HarnessGitPort, "fetch" | "catchUp">;
    freshness: HarnessFreshnessPort;
    now: () => Date;
  };
  private readonly gate: ReuseGate<HarnessFetchOutcome>;

  constructor(deps: HarnessFetchGate["deps"]) {
    this.deps = deps;
    this.gate = new ReuseGate({ now: deps.now, keep: () => true });
  }

  /** Always fetches; joins a fetch already in flight. */
  fetchFresh(root: string): Promise<HarnessFetchOutcome> {
    return this.fetch(root, 0);
  }

  /** May answer with a fetch younger than the reuse window. */
  fetchRecent(root: string): Promise<HarnessFetchOutcome> {
    return this.fetch(root, RECENT_MAX_AGE_MS);
  }

  invalidate(root: string): void {
    this.gate.invalidate(root);
  }

  private fetch(root: string, maxAgeMs: number): Promise<HarnessFetchOutcome> {
    return this.gate.run(root, maxAgeMs, async () => {
      const outcome = await recordFetch(this.deps, root, this.deps.now());
      // Catching up writes the working tree; it never loses local work (#978).
      await this.deps.git.catchUp(root);
      return outcome;
    });
  }
}
