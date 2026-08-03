// The Harness home base's one read: repository facts plus how fresh they are.
// Git details stay behind the port — no stdout, stderr, or remote text reaches
// this use-case, so none can reach a response (ADR-0021, security.md).
import { parseGitOrigin } from "../deploy/git-origin";
import { highestReleaseTag } from "./release-tag";
import type { HarnessSkillTree, SkillMovement } from "./skill-movements";
import { diffSkillTrees } from "./skill-movements";

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

export interface HarnessGitPort {
  fetch(root: string): Promise<HarnessFetchOutcome>;
  readFacts(root: string): Promise<HarnessFacts>;
  // One tree hash per canonical skill directory at `ref`, so the delta is read
  // from content rather than from which commits lead where. Null is a ref that
  // could not be read at all — never an empty harness.
  readSkillTrees(root: string, ref: string): Promise<HarnessSkillTree[] | null>;
  // Who last touched each named skill directory at `ref`; null where the
  // history gives no answer.
  readSkillAuthors(
    root: string,
    ref: string,
    names: string[],
  ): Promise<Record<string, string | null>>;
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

export type PendingSkillMovement = SkillMovement & { author: string | null };

export type HarnessState = {
  origin: string;
  releasedVersion: string | null;
  defaultBranch: string | null;
  releaseState: HarnessReleaseState;
  pendingRelease: PendingSkillMovement[];
  freshness: HarnessFreshness;
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
    const head = facts.defaultBranchCommit;
    // Null where the two sides could not both be read. A delta nobody could
    // compute is not an empty one (LEARNINGS.md · J04).
    const movements =
      confirmed && head !== null
        ? await this.movementsSince(root, released, head)
        : null;
    return {
      ok: true,
      state: {
        origin: `${origin.host}/${origin.ownerRepo}`,
        releasedVersion: released?.name ?? null,
        defaultBranch: facts.defaultBranch,
        releaseState:
          confirmed && movements !== null
            ? releaseState(released, head)
            : "unknown",
        pendingRelease: movements ?? [],
        freshness,
      },
    };
  }

  // Both refs are commits, so a tag pointing outside the default branch's
  // history is compared like any other: the delta is content, not reachability.
  private async movementsSince(
    root: string,
    released: HarnessTag | null,
    head: string,
  ): Promise<PendingSkillMovement[] | null> {
    const previous =
      released === null
        ? []
        : await this.deps.git.readSkillTrees(root, released.commit);
    const current = await this.deps.git.readSkillTrees(root, head);
    if (previous === null || current === null) {
      return null;
    }
    const movements = diffSkillTrees(previous, current);

    // The default branch answers for every movement it carries, including the
    // commit that deleted a skill.
    const authored = await this.deps.git.readSkillAuthors(
      root,
      head,
      movements.map((movement) => movement.name),
    );
    // A tag off the default branch's history can carry a skill that branch
    // never saw, so its removal has no author there. The release ref does.
    const orphaned = movements
      .filter(
        (movement) =>
          movement.kind === "removed" && authored[movement.name] == null,
      )
      .map((movement) => movement.name);
    const atRelease =
      released !== null && orphaned.length > 0
        ? await this.deps.git.readSkillAuthors(root, released.commit, orphaned)
        : {};

    return movements.map((movement) => ({
      ...movement,
      author: authored[movement.name] ?? atRelease[movement.name] ?? null,
    }));
  }
}

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
