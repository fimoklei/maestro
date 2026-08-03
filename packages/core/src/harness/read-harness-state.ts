// The Harness home base's one read: repository facts plus how fresh they are.
// Git details stay behind the port — no stdout, stderr, or remote text reaches
// this use-case, so none can reach a response (ADR-0021, security.md).
import { parseGitOrigin } from "../deploy/git-origin";
import { classifyMovement, type MovementState } from "./classify-movement";
import { highestReleaseTag } from "./release-tag";

export type HarnessFetchOutcome = "fetched" | "offline" | "fetch-failed";

// `outcome: null` means no fetch has been attempted yet; `lastFetchedAt: null`
// means none has ever succeeded. The two are independent.
export type HarnessFreshness = {
  outcome: HarnessFetchOutcome | null;
  lastFetchedAt: string | null;
};

export type HarnessTag = { name: string; commit: string };

export type HarnessFacts = {
  originUrl: string | null;
  defaultBranch: string | null;
  defaultBranchCommit: string | null;
  tags: HarnessTag[];
};

// One tree hash per canonical skill directory, at each of the four places a
// skill's content can sit. A name absent from a map is a skill absent there.
export type HarnessSkillTrees = {
  remote: Record<string, string>;
  promote: Record<string, string>;
  local: Record<string, string>;
  working: Record<string, string>;
};

export interface HarnessGitPort {
  fetch(root: string): Promise<HarnessFetchOutcome>;
  readFacts(root: string): Promise<HarnessFacts>;
  readSkillTrees(root: string): Promise<HarnessSkillTrees>;
}

// Every call names the harness root: one record per harness, so connecting a
// second one never inherits the first one's age (#516).
export interface HarnessFreshnessPort {
  read(root: string): Promise<HarnessFreshness>;
  record(root: string, freshness: HarnessFreshness): Promise<void>;
}

// `never-released` and `pending-release` are ordinary days, not errors.
// `unknown` is a clone with no `origin/HEAD` to compare against — an
// uncheckable check is never a verdict (LEARNINGS.md · J04).
export type HarnessReleaseState =
  | "released"
  | "pending-release"
  | "never-released"
  | "unknown";

export type HarnessMovement = {
  skill: string;
  state: MovementState;
};

export type HarnessState = {
  origin: string;
  releasedVersion: string | null;
  defaultBranch: string | null;
  releaseState: HarnessReleaseState;
  freshness: HarnessFreshness;
  movements: HarnessMovement[];
};

export type HarnessStateError = "not-configured" | "no-usable-origin";

export type HarnessStateResult =
  | { ok: true; state: HarnessState }
  | { ok: false; error: HarnessStateError };

export class ReadHarnessState {
  private readonly deps: {
    resolveRoot: () => Promise<string | undefined>;
    git: HarnessGitPort;
    freshness: HarnessFreshnessPort;
  };

  // One fetch per harness at a time: the view opens under StrictMode and a
  // second tab is ordinary, and two fetches race over the same git refs.
  // Callers arriving mid-flight share the answer rather than being refused.
  private inFlight = new Map<string, Promise<HarnessStateResult>>();

  constructor(deps: ReadHarnessState["deps"]) {
    this.deps = deps;
  }

  // Opening the Harness and pressing Refresh are the same act: fetch, record
  // what the fetch found, then read. A failed fetch never overwrites the last
  // successful time — that timestamp is what makes a stale picture readable.
  async refresh(at: Date): Promise<HarnessStateResult> {
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }

    const running = this.inFlight.get(root);
    if (running !== undefined) {
      return running;
    }
    const fetching = this.fetchAndRead(root, at).finally(() => {
      this.inFlight.delete(root);
    });
    this.inFlight.set(root, fetching);
    return fetching;
  }

  private async fetchAndRead(
    root: string,
    at: Date,
  ): Promise<HarnessStateResult> {
    const outcome = await this.deps.git.fetch(root);
    const previous = await this.deps.freshness.read(root);
    await this.deps.freshness.record(root, {
      outcome,
      lastFetchedAt:
        outcome === "fetched" ? at.toISOString() : previous.lastFetchedAt,
    });
    // The root resolved above, never a second lookup: a reconnect in between
    // would fetch one harness and report the other.
    return this.stateFor(root);
  }

  async execute(): Promise<HarnessStateResult> {
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }
    return this.stateFor(root);
  }

  private async stateFor(root: string): Promise<HarnessStateResult> {
    const facts = await this.deps.git.readFacts(root);
    const freshness = await this.deps.freshness.read(root);
    const origin =
      facts.originUrl === null ? null : parseGitOrigin(facts.originUrl);
    if (origin === null) {
      return { ok: false, error: "no-usable-origin" };
    }

    // Releases are only what a fetch of Maestro's own tag namespace found. Until
    // one has succeeded the list is empty because nobody looked, and reading
    // that as "no release exists" would invent a fact (ADR-0021).
    const confirmed = freshness.lastFetchedAt !== null;
    const released = confirmed ? highestReleaseTag(facts.tags) : null;
    const movements = skillMovements(await this.deps.git.readSkillTrees(root));
    return {
      ok: true,
      state: {
        origin: `${origin.host}/${origin.ownerRepo}`,
        releasedVersion: released?.name ?? null,
        defaultBranch: facts.defaultBranch,
        releaseState: confirmed
          ? releaseState(released, facts.defaultBranchCommit)
          : "unknown",
        freshness,
        movements,
      },
    };
  }
}

// Every name any of the four refs knows, so a skill that exists only on a
// promote branch or only on disk is still asked about. Sorted, so the tables
// do not reshuffle between reads.
const skillMovements = (trees: HarnessSkillTrees): HarnessMovement[] => {
  const names = new Set(Object.values(trees).flatMap(Object.keys));
  return [...names].sort().flatMap((skill) => {
    const state = classifyMovement({
      remote: trees.remote[skill] ?? null,
      promote: trees.promote[skill] ?? null,
      local: trees.local[skill] ?? null,
      working: trees.working[skill] ?? null,
    });
    return state === null ? [] : [{ skill, state }];
  });
};

const releaseState = (
  released: HarnessTag | null,
  defaultBranchCommit: string | null,
): HarnessReleaseState => {
  if (defaultBranchCommit === null) {
    return "unknown";
  }
  if (released === null) {
    return "never-released";
  }
  return released.commit === defaultBranchCommit
    ? "released"
    : "pending-release";
};
