// Every fetch of the Harness clone goes through here: two fetches race over
// the same git refs. Key it on the resolved root, never the configured path.
import { ReuseGate } from "../reuse-gate";
import type {
  HarnessFetchOutcome,
  HarnessFreshnessPort,
  HarnessGitPort,
} from "./read-harness-state";
import { recordFetch } from "./record-fetch";

export class HarnessFetchGate {
  private readonly deps: {
    git: Pick<HarnessGitPort, "fetch" | "catchUp">;
    freshness: HarnessFreshnessPort;
    now: () => Date;
  };
  private readonly gate: ReuseGate<HarnessFetchOutcome>;

  constructor(deps: HarnessFetchGate["deps"]) {
    this.deps = deps;
    this.gate = new ReuseGate({ now: deps.now });
  }

  fetch(root: string, maxAgeMs: number): Promise<HarnessFetchOutcome> {
    return this.gate.run(root, maxAgeMs, async () => {
      const outcome = await recordFetch(this.deps, root, this.deps.now());
      // Catching up writes the working tree; it never loses local work (#978).
      await this.deps.git.catchUp(root);
      return outcome;
    });
  }

  invalidate(root: string): void {
    this.gate.invalidate(root);
  }
}
