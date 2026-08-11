// The Harness home base's one read: repository facts plus how fresh they are.
// Git details stay behind the port — no stdout, stderr, or remote text reaches
// this use-case, so none can reach a response (ADR-0021, security.md).
import { parseGitOrigin } from "../deploy/git-origin";
import {
  classifyMovement,
  isLocalDeletion,
  type MovementState,
} from "./classify-movement";
import {
  proposeReleaseVersion,
  type SemverStep,
} from "./propose-release-version";
import { recordFetch } from "./record-fetch";
import { highestReleaseTag } from "./release-tag";
import type { HarnessSkillTree, SkillMovement } from "./skill-movements";
import { diffSkillTrees } from "./skill-movements";
import {
  type StructuralFinding,
  validateSkillStructure,
} from "./validate-skill-structure";

export type HarnessFetchOutcome = "fetched" | "offline" | "fetch-failed";

// `already-exists` is a remote refusal, not a failure: another author's tag
// already claims that exact name, and the push must never force over it.
// `stale-tip` is the lease refusing: the branch moved after this confirmation
// read it, so nothing was created.
export type PublishTagOutcome =
  | "pushed"
  | "already-exists"
  | "stale-tip"
  | "offline"
  | "push-failed";

// `skill-missing` is a working harness with no such directory: a deletion is
// its own confirmed route (#580), never something a promotion infers. `offline`
// is a push that got no answer at all; `push-failed` is any reply that refused
// it, and both leave a retry available.
export type PromoteSkillOutcome =
  | "pushed"
  | "skill-missing"
  | "offline"
  // The clone's push destination is not the origin the pull-request link is
  // built from, so nothing was pushed — see `push-destination.ts`.
  | "push-elsewhere"
  // The skill's directory moved while it was being read, so what was built is
  // a tree the author never had.
  | "source-changed"
  | "push-failed";

// `outcome: null` means no fetch has been attempted yet; `lastFetchedAt: null`
// means none has ever succeeded. The two are independent.
export type HarnessFreshness = {
  outcome: HarnessFetchOutcome | null;
  lastFetchedAt: string | null;
};

export type HarnessTag = { name: string; commit: string };

// `tags: null` is a namespace that could not be read at all — never a harness
// with no releases. An empty list is only ever "looked, found none".
export type HarnessFacts = {
  originUrl: string | null;
  defaultBranch: string | null;
  defaultBranchCommit: string | null;
  tags: HarnessTag[] | null;
};

// One tree hash per canonical skill directory, at each of the four places a
// skill's content can sit. A name absent from a map is a skill absent there —
// except in `promote`, where the key is the branch and a null value is a
// branch proposing to delete its skill.
export type HarnessSkillTrees = {
  remote: Record<string, string>;
  promote: Record<string, string | null>;
  local: Record<string, string>;
  working: Record<string, string>;
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
  // The four places a skill's content can sit locally, for the movement
  // tables. Null where a ref could not be read, on the same rule as above.
  readMovementTrees(root: string): Promise<HarnessSkillTrees | null>;
  // The raw SKILL.md text of each named skill at `ref`, for the release plan's
  // structural findings. Null where the file is absent — never an empty string,
  // which is a present-but-blank manifest.
  readSkillManifests(
    root: string,
    ref: string,
    names: string[],
  ): Promise<Record<string, string | null>>;
  // Creates and pushes one lightweight tag at the exact commit given, never a
  // mutable ref and never `--force`. `defaultBranch` is never written: it is
  // the lease the tag rides on (ADR-0023).
  publishTag(
    root: string,
    name: string,
    commit: string,
    defaultBranch: string,
  ): Promise<PublishTagOutcome>;
  // Builds one commit — `baseCommit`'s tree with exactly `.apm/skills/<name>`
  // replaced by the working harness's copy — and pushes it to `maestro/<name>`,
  // creating that branch when it does not exist. Never checks out, stages in
  // the real index, moves HEAD, or force-pushes (#574).
  pushSkillPromotion(
    root: string,
    name: string,
    baseCommit: string,
  ): Promise<PromoteSkillOutcome>;
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

export type HarnessMovement = {
  skill: string;
  state: MovementState;
  // True when the skill was tracked at local HEAD and is gone from disk — a
  // deletion the view labels `deleted locally` (#575).
  deletion: boolean;
};

export type HarnessState = {
  origin: string;
  releasedVersion: string | null;
  defaultBranch: string | null;
  releaseState: HarnessReleaseState;
  pendingRelease: PendingSkillMovement[];
  freshness: HarnessFreshness;
  movements: HarnessMovement[];
};

export type HarnessStateError = "not-configured" | "no-usable-origin";

export type HarnessStateResult =
  | { ok: true; state: HarnessState }
  | { ok: false; error: HarnessStateError };

// Everything the consequences-first release dialog states before the author
// picks a step. Advisory `findings` explain risk but never disable a release
// (#519). `revision` is the exact origin/HEAD commit a later job will tag.
export type ReleasePlan = {
  delta: PendingSkillMovement[];
  previousTag: string | null;
  // Where that tag pointed when the delta was computed. A tag force-moved
  // under an unchanged name would otherwise price a release nobody read.
  previousTagCommit: string | null;
  proposedStep: SemverStep;
  reason: string;
  versions: Record<SemverStep, string>;
  revision: string;
  defaultBranch: string;
  findings: StructuralFinding[];
};

// `no-answer` is a plan Maestro could not compute because the remote gave none
// to compare against — never an empty release (LEARNINGS.md · J04).
export type ReleasePlanError =
  | "not-configured"
  | "no-usable-origin"
  | "no-answer";

export type ReleasePlanResult =
  | { ok: true; plan: ReleasePlan }
  | { ok: false; error: ReleasePlanError };

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
    await recordFetch(this.deps, root, at);
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

  // The release plan the dialog reads: the merged delta with authors, the
  // proposed version and its reason, the exact revision a tag would point at,
  // and advisory structural findings. A read of already-fetched refs — the
  // network re-check at confirmation belongs to a later job (#520, #521).
  async planRelease(): Promise<ReleasePlanResult> {
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }
    return await this.planReleaseAt(root);
  }

  // The same plan against a root the caller already resolved and holds. A
  // refused publication recomputes through here, so its answer can never come
  // from a harness that was connected while its own push was in flight (#521).
  async planReleaseAt(root: string): Promise<ReleasePlanResult> {
    const facts = await this.deps.git.readFacts(root);
    const freshness = await this.deps.freshness.read(root);
    const origin =
      facts.originUrl === null ? null : parseGitOrigin(facts.originUrl);
    if (origin === null) {
      return { ok: false, error: "no-usable-origin" };
    }

    // A plan needs a remote to compare against: a confirmed fetch, a readable
    // origin/HEAD, and a tag namespace that was read at all. A failed tag read
    // is not a first release — proposing v0.1.0 over it would collide with a
    // version that already exists (#519).
    const confirmed = freshness.lastFetchedAt !== null;
    const head = facts.defaultBranchCommit;
    const tags = facts.tags;
    if (
      !confirmed ||
      head === null ||
      facts.defaultBranch === null ||
      tags === null
    ) {
      return { ok: false, error: "no-answer" };
    }

    // One read of origin/HEAD's skills serves both the delta and the checks.
    // Two reads can disagree, and a second one that failed would report "no
    // advisories" for checks that never ran.
    const current = await this.deps.git.readSkillTrees(root, head);
    if (current === null) {
      return { ok: false, error: "no-answer" };
    }

    const released = highestReleaseTag(tags);
    const delta = await this.movementsSince(root, released, head, current);
    if (delta === null) {
      return { ok: false, error: "no-answer" };
    }

    const proposal = proposeReleaseVersion(released?.name ?? null, delta);
    return {
      ok: true,
      plan: {
        delta,
        // The proposal's own reading of the tag, so the dialog never names a
        // previous release the version was not computed from.
        previousTag: proposal.previousTag,
        // Null wherever the proposal found no tag to bump from, so the two
        // fields always describe the same release.
        previousTagCommit:
          proposal.previousTag === null ? null : (released?.commit ?? null),
        proposedStep: proposal.proposedStep,
        reason: proposal.reason,
        versions: proposal.versions,
        revision: head,
        defaultBranch: facts.defaultBranch,
        findings: await this.structuralFindings(root, head, current),
      },
    };
  }

  // The three advisory rules over every skill at origin/HEAD, not only the
  // moved ones: an unchanged skill can still ship a broken manifest. One
  // finding per failing skill, in name order (#519).
  private async structuralFindings(
    root: string,
    head: string,
    trees: HarnessSkillTree[],
  ): Promise<StructuralFinding[]> {
    const names = trees.map((tree) => tree.name).sort();
    const manifests = await this.deps.git.readSkillManifests(root, head, names);
    return names.flatMap((name) => {
      const problem = validateSkillStructure(manifests[name] ?? null);
      return problem === null ? [] : [{ skill: name, problem }];
    });
  }

  private async stateFor(root: string): Promise<HarnessStateResult> {
    const facts = await this.deps.git.readFacts(root);
    const freshness = await this.deps.freshness.read(root);
    const origin =
      facts.originUrl === null ? null : parseGitOrigin(facts.originUrl);
    if (origin === null) {
      return { ok: false, error: "no-usable-origin" };
    }

    // Releases are only what a fetch of Maestro's own tag namespace found.
    // Before one has succeeded, or when the namespace could not be read, the
    // list says nothing — and reading that as "no release exists" would invent
    // a fact (ADR-0021).
    const confirmed = freshness.lastFetchedAt !== null;
    const tags = confirmed ? facts.tags : null;
    const released = tags === null ? null : highestReleaseTag(tags);
    const head = facts.defaultBranchCommit;
    // Null where the two sides could not both be read. A delta nobody could
    // compute is not an empty one (LEARNINGS.md · J04).
    const current =
      tags !== null && head !== null
        ? await this.deps.git.readSkillTrees(root, head)
        : null;
    const movements =
      current === null || head === null
        ? null
        : await this.movementsSince(root, released, head, current);
    // Same rule, one ref set further: an unreadable ref leaves the local
    // tables unknown rather than reading as nothing waiting.
    const trees = await this.deps.git.readMovementTrees(root);
    return {
      ok: true,
      state: {
        origin: `${origin.host}/${origin.ownerRepo}`,
        releasedVersion: released?.name ?? null,
        defaultBranch: facts.defaultBranch,
        releaseState:
          tags !== null && movements !== null && trees !== null
            ? releaseState(released, head)
            : "unknown",
        pendingRelease: movements ?? [],
        freshness,
        movements: trees === null ? [] : movementsFromTrees(trees),
      },
    };
  }

  // Both refs are commits, so a tag pointing outside the default branch's
  // history is compared like any other: the delta is content, not reachability.
  private async movementsSince(
    root: string,
    released: HarnessTag | null,
    head: string,
    current: HarnessSkillTree[],
  ): Promise<PendingSkillMovement[] | null> {
    const previous =
      released === null
        ? []
        : await this.deps.git.readSkillTrees(root, released.commit);
    if (previous === null) {
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

// Every name any of the four refs knows, so a skill that exists only on a
// promote branch or only on disk is still asked about. Sorted, so the tables
// do not reshuffle between reads.
const movementsFromTrees = (trees: HarnessSkillTrees): HarnessMovement[] => {
  const names = new Set(Object.values(trees).flatMap(Object.keys));
  return [...names].sort().flatMap((skill) => {
    const hashes = {
      remote: trees.remote[skill] ?? null,
      // Presence of the key, not of a hash: the branch may be deleting it.
      promote: Object.hasOwn(trees.promote, skill)
        ? { tree: trees.promote[skill] ?? null }
        : null,
      local: trees.local[skill] ?? null,
      working: trees.working[skill] ?? null,
    };
    const state = classifyMovement(hashes);
    return state === null
      ? []
      : [{ skill, state, deletion: isLocalDeletion(hashes) }];
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
