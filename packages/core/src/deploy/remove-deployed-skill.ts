// The remove use-case: take "take skill X off repo Y" from the screen and
// orchestrate it — validate the request, refuse an unregistered repo before
// anything is read, rebuild the tag-pinned reference the install used from the
// target's own lockfile, and hand it to the ApmDriver under the same per-target
// lock the deploy takes. Business rules live here; the server route only carries
// it over HTTP.
//
// Removing a deploy never touches the central inventory: the inventory is what a
// repo could have, and this only changes what one repo does have.
//
// Two entry points, one guard: `preflight` says what the removal would destroy
// so the confirmation can state it, and `execute` carries it out. Divergence
// warns rather than refusing — destruction is this use-case's intent, not a side
// effect, so informed consent is enough (#337).
import type {
  ApmDriverPort,
  DeployedContentPort,
  DeployedContentState,
  DeployTarget,
} from "./deploy-skill";
import type { DeployedRefLookup } from "./deployed-ref";
import { InFlightLocks } from "./in-flight-locks";
import { isValidSkillSlug } from "./package-ref";

// Which package reference names the deployed skill, read from the target's own
// lockfile. Implemented by DeployedRefAdapter.
export type DeployedRefPort = {
  resolve(input: {
    target: DeployTarget;
    name: string;
  }): Promise<DeployedRefLookup>;
};

type RemoveDeployedSkillInput = {
  // Accepted as a plain string at the edge; the skill-only rule is a business
  // rule here, not a schema shape, so the user gets an honest message.
  type: string;
  name: string;
  repoPath: string;
};

export type RemoveDeployedSkillError =
  | "unsupported-primitive-type"
  | "invalid-name"
  | "repo-not-registered"
  // No lockfile entry for this skill, so there is nothing for apm to remove —
  // the row the user clicked is stale. Reported rather than swallowed as a
  // success: a silent no-op would read as "removed" for something we never
  // touched.
  | "not-deployed"
  // The target's apm.lock.yaml is present but does not parse, so nothing about
  // what is deployed can be trusted. Refuse rather than guess a ref (#58).
  | "lockfile-malformed"
  // The entry exists but does not name the skill the row named, in the shape a
  // deploy of ours writes — so the ref cannot be trusted to aim at this skill.
  // A guessed ref would match nothing and still exit 0, or worse, match another
  // installed package.
  | "ref-unresolvable"
  // The deployed copy exists but cannot be read (permission denied, I/O error).
  // We cannot prove there is nothing to lose, so refuse.
  | "deployed-unreadable"
  // Another apm write to this repo is already running (a deploy, or a
  // double-clicked remove). Racing it would corrupt the same apm.lock.yaml.
  | "remove-in-progress"
  // apm did not print its positive uninstall marker, so the removal is
  // unproven. The target may be partly changed — the cockpit says so rather
  // than claiming a clean state.
  | "remove-failed";

// What the confirmation must tell the user before they destroy the deployed
// copy. Named for the consequence, not the classifier state, because that is
// what the user is consenting to.
export type RemoveWarning =
  // The copy differs from the per-file hashes the lockfile recorded, so the
  // removal takes real local work with it.
  | "local-edits-will-be-lost"
  // The check ran and found nothing recorded to verify the copy against, so
  // whether there is work to lose is unknown. Unknown is never quietly reported
  // as safe (J04).
  | "cannot-verify-local-edits"
  // The check could not run at all — the copy would not read, or the lockfile
  // it reads does not parse. Kept apart from the case above so the wording
  // never claims a cause nothing observed.
  | "check-did-not-run";

// What each destination-guard state means for a removal. Only a state that
// makes the removal itself unsafe to run refuses; a copy that carries local
// edits, verified or unverifiable, is warned about and then removed on the
// user's word — destruction is this use-case's intent, not a side effect
// (#337).
const GUARD_REFUSALS: Partial<
  Record<DeployedContentState, RemoveDeployedSkillError>
> = {
  unreadable: "deployed-unreadable",
  "lockfile-malformed": "lockfile-malformed",
};

// The states the user is told about before confirming. The two absent here —
// "clean" and "not-deployed" — are the only ones with nothing to lose; every
// other state says something, because silence in a confirmation reads as
// nothing-to-lose (J04). A state the removal itself refuses still warns: "we
// could not check this copy" is true either way.
const GUARD_WARNINGS: Partial<Record<DeployedContentState, RemoveWarning>> = {
  diverged: "local-edits-will-be-lost",
  unverifiable: "cannot-verify-local-edits",
  unreadable: "check-did-not-run",
  "lockfile-malformed": "check-did-not-run",
};

// Why the pre-confirmation check could not answer. It never falls back to "no
// warning": a check that failed proves nothing about what the removal would
// destroy.
export type RemovePreflightError =
  | "unsupported-primitive-type"
  | "invalid-name"
  | "repo-not-registered"
  | "preflight-failed";

type RemoveDeployedSkillResult =
  | { ok: true; removed: { type: "skill"; name: string } }
  | { ok: false; error: RemoveDeployedSkillError };

type RemovePreflightResult =
  | { ok: true; warning: RemoveWarning | null }
  | { ok: false; error: RemovePreflightError };

export class RemoveDeployedSkill {
  private readonly deps: {
    registry: { isRegistered(path: string): Promise<boolean> };
    deployedRef: DeployedRefPort;
    // The destination guard, the same one the deploy path runs. A removal
    // deletes files, and apm deletes an edited one silently, so this is what
    // stands between a tidy-up and lost work (.claude/rules/apm-driver.md).
    deployedContent: DeployedContentPort;
    // Depends only on the port method it uses, so growing ApmDriverPort never
    // breaks this use-case or its fakes.
    apm: Pick<ApmDriverPort, "removeSkill">;
    // Resolves a path to its canonical form (realpath), so the in-flight lock
    // cannot be sidestepped by a symlinked spelling of the same repo.
    canonicalPath: (path: string) => Promise<string>;
    // The per-target apm write lock, shared with the deploy use-case. Omitted,
    // this use-case guards only against itself — enough for a test, never for
    // the composed server.
    locks?: InFlightLocks;
  };

  private readonly locks: InFlightLocks;

  constructor(deps: RemoveDeployedSkill["deps"]) {
    this.deps = deps;
    this.locks = deps.locks ?? new InFlightLocks();
  }

  // What the confirmation must say before this removal runs: the deployed copy
  // classified through the same seam the removal itself uses, translated into
  // the consequence the user is about to accept. A read — it never removes
  // anything, and it never takes the apm write lock, so asking cannot block a
  // deploy already in flight.
  async preflight(
    input: RemoveDeployedSkillInput,
  ): Promise<RemovePreflightResult> {
    const rejection = await this.rejectBadRequest(input);
    if (rejection !== undefined) {
      return { ok: false, error: rejection };
    }

    try {
      const state = await this.deps.deployedContent.classify({
        target: { kind: "repo", repoPath: input.repoPath },
        name: input.name,
      });
      return { ok: true, warning: GUARD_WARNINGS[state] ?? null };
    } catch {
      return { ok: false, error: "preflight-failed" };
    }
  }

  async execute(
    input: RemoveDeployedSkillInput,
  ): Promise<RemoveDeployedSkillResult> {
    const rejection = await this.rejectBadRequest(input);
    if (rejection !== undefined) {
      return { ok: false, error: rejection };
    }

    let lockKey: string;
    try {
      lockKey = await this.deps.canonicalPath(input.repoPath);
    } catch {
      // Registration guarantees the path exists, so this only fires on a
      // genuinely broken environment — owned as the catch-all error.
      return { ok: false, error: "remove-failed" };
    }

    const run = await this.locks.run(lockKey, () => this.remove(input));
    return run.ok ? run.value : { ok: false, error: "remove-in-progress" };
  }

  // The request-shape rules both entry points share, in the order that keeps
  // them safe: the registry gate is last but still before any filesystem or apm
  // access, so an unregistered path can neither probe a lockfile nor reach apm
  // (security.md). Returns the refusal, or undefined when the request is sound.
  private async rejectBadRequest(
    input: RemoveDeployedSkillInput,
  ): Promise<
    | "unsupported-primitive-type"
    | "invalid-name"
    | "repo-not-registered"
    | undefined
  > {
    if (input.type !== "skill") {
      return "unsupported-primitive-type";
    }
    if (!isValidSkillSlug(input.name)) {
      return "invalid-name";
    }
    if (!(await this.deps.registry.isRegistered(input.repoPath))) {
      return "repo-not-registered";
    }
    return undefined;
  }

  private async remove(
    input: RemoveDeployedSkillInput,
  ): Promise<RemoveDeployedSkillResult> {
    const target: DeployTarget = { kind: "repo", repoPath: input.repoPath };
    // From here on we touch the filesystem and drive apm, both of which can
    // throw. Own that as a typed error so it never escapes as an unhandled
    // rejection (and the raw apm message, which may carry a token, never
    // reaches the transport layer).
    try {
      const lookup = await this.deps.deployedRef.resolve({
        target,
        name: input.name,
      });
      if (!lookup.ok) {
        return { ok: false, error: lookup.reason };
      }

      // Destination guard: what it finds decides between refusing and
      // proceeding. Reaching this point means the user already confirmed a
      // removal whose consequence `preflight` stated, so an edited or
      // unverifiable copy goes; only a copy we cannot read, or a lockfile we
      // cannot parse, still refuses (#337).
      const deployedState = await this.deps.deployedContent.classify({
        target,
        name: input.name,
      });
      const refusal = GUARD_REFUSALS[deployedState];
      if (refusal !== undefined) {
        return { ok: false, error: refusal };
      }

      const removed = await this.deps.apm.removeSkill({
        target,
        ref: lookup.ref,
      });
      if (!removed.ok) {
        return { ok: false, error: "remove-failed" };
      }
      return { ok: true, removed: { type: "skill", name: input.name } };
    } catch {
      return { ok: false, error: "remove-failed" };
    }
  }
}
