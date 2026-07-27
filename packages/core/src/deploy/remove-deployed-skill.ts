// The remove use-case: take "take skill X off repo Y" from the screen and
// orchestrate it — validate the request, refuse an unregistered repo before
// anything is read, rebuild the tag-pinned reference the install used from the
// target's own lockfile, and hand it to the ApmDriver under the same per-target
// lock the deploy takes. Business rules live here; the server route only carries
// it over HTTP.
//
// Removing a deploy never touches the central inventory: the inventory is what a
// repo could have, and this only changes what one repo does have.
import type { ApmDriverPort, DeployTarget } from "./deploy-skill";
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
  // The entry exists but names no origin repo or host, so the ref the install
  // used cannot be rebuilt. A guessed ref would match nothing and still exit 0,
  // which is the one outcome that must never read as a removal.
  | "ref-unresolvable"
  // Another apm write to this repo is already running (a deploy, or a
  // double-clicked remove). Racing it would corrupt the same apm.lock.yaml.
  | "remove-in-progress"
  // apm did not print its positive uninstall marker, so the removal is
  // unproven. The target may be partly changed — the cockpit says so rather
  // than claiming a clean state.
  | "remove-failed";

type RemoveDeployedSkillResult =
  | { ok: true; removed: { type: "skill"; name: string } }
  | { ok: false; error: RemoveDeployedSkillError };

export class RemoveDeployedSkill {
  private readonly deps: {
    registry: { isRegistered(path: string): Promise<boolean> };
    deployedRef: DeployedRefPort;
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

  async execute(
    input: RemoveDeployedSkillInput,
  ): Promise<RemoveDeployedSkillResult> {
    if (input.type !== "skill") {
      return { ok: false, error: "unsupported-primitive-type" };
    }
    if (!isValidSkillSlug(input.name)) {
      return { ok: false, error: "invalid-name" };
    }
    // Registry gate first: a path-taking endpoint must reject an unregistered
    // repo before any filesystem or apm access, so an unregistered path can
    // neither probe a lockfile nor reach apm (security.md).
    if (!(await this.deps.registry.isRegistered(input.repoPath))) {
      return { ok: false, error: "repo-not-registered" };
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
