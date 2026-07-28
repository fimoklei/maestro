// The remove use-case. `preflight` states what the removal would destroy;
// `execute` carries it out under the same per-target lock the deploy takes.
// See ADR-0011, ADR-0013, #337, apm-behavior.md § Remove.
import type { ToolPresencePort } from "../tools/tool-presence-port";
import type {
  ApmDriverPort,
  DeployedCleanupPort,
  DeployedContentPort,
  DeployedContentState,
  DeployTarget,
} from "./deploy-skill";
import type { SupportedTool } from "./deploy-tools";
import type { DeployedLocation } from "./deployed-location";
import type { DeployedRefLookup } from "./deployed-ref";
import { GLOBAL_LOCK_KEY, InFlightLocks } from "./in-flight-locks";
import { isValidSkillSlug } from "./package-ref";
import { type ReclaimConsent, ReclaimConsentIssuer } from "./reclaim-consent";
import { reclaimTools } from "./reclaim-untargeted-copies";

// Reads the ref from the target's own lockfile, never from the caller.
export type DeployedRefPort = {
  resolve(input: {
    target: DeployTarget;
    name: string;
  }): Promise<DeployedRefLookup>;
};

type RemoveDeployedSkillInput = {
  // Plain string, not a literal union: the skill-only rule is enforced here so
  // the user gets a business-rule message rather than a schema rejection.
  type: string;
  name: string;
  target: DeployTarget;
  // Token from this request's own `preflight`, never a client-supplied path
  // list. Missing, stale, or guessed reclaims nothing (#390).
  confirmedReclaimToken?: string;
};

// Each member's meaning for the user is the server's `removeErrorResponses`
// table; no member is ever swallowed as a success.
export type RemoveDeployedSkillError =
  | "unsupported-primitive-type"
  | "invalid-name"
  | "repo-not-registered"
  | "no-supported-tool"
  | "not-deployed"
  | "lockfile-malformed"
  | "ref-unresolvable"
  | "deployed-unreadable"
  | "remove-in-progress"
  | "remove-failed";

// Named for the consequence the user consents to, not the classifier state.
// The last two stay apart: "checked, nothing to compare against" and "could not
// check" must not share a wording (J04).
export type RemoveWarning =
  | "local-edits-will-be-lost"
  | "cannot-verify-local-edits"
  | "check-did-not-run";

// Only a state that makes the removal unsafe to run refuses; local edits are
// warned about and then removed on the user's word (#337).
const GUARD_REFUSALS: Partial<
  Record<DeployedContentState, RemoveDeployedSkillError>
> = {
  unreadable: "deployed-unreadable",
  "lockfile-malformed": "lockfile-malformed",
};

// Absent means nothing to lose ("clean", "not-deployed") — silence in a
// confirmation reads that way, so every other state must appear here (J04).
// A state the removal refuses still warns.
const GUARD_WARNINGS: Partial<Record<DeployedContentState, RemoveWarning>> = {
  diverged: "local-edits-will-be-lost",
  unverifiable: "cannot-verify-local-edits",
  unreadable: "check-did-not-run",
  "lockfile-malformed": "check-did-not-run",
};

// A failed check never falls back to "no warning" — it proves nothing.
export type RemovePreflightError =
  | "unsupported-primitive-type"
  | "invalid-name"
  | "repo-not-registered"
  | "no-supported-tool"
  | "preflight-failed";

// `detected` is not what the guard reads — apm deletes by its own recorded
// targets. It feeds the cleanup after a successful removal (#339); required on
// the global arm so the reclaim cannot be skipped by omitting a property.
type ResolvedScope =
  | { ok: true; scope: "repo" }
  | { ok: true; scope: "global"; detected: readonly SupportedTool[] }
  | { ok: false; error: "no-supported-tool" };

// Global carries the tools the live probe found at execution time — the only
// set apm can have reached (ADR-0011).
export type RemovedScope =
  | { kind: "repo" }
  | { kind: "global"; tools: readonly SupportedTool[] };

// `version` and `scope` are what the removal ran against, never what the caller
// had in view — either can be stale by the time the user confirms (#383).
type RemoveDeployedSkillResult =
  | {
      ok: true;
      removed: {
        type: "skill";
        name: string;
        version: string;
        scope: RemovedScope;
      };
    }
  | { ok: false; error: RemoveDeployedSkillError };

type RemovePreflightResult =
  | {
      ok: true;
      warning: RemoveWarning | null;
      // Paths and token in one field, so neither can reach the confirmation
      // without the other.
      reclaim: ReclaimConsent | null;
    }
  | { ok: false; error: RemovePreflightError };

export class RemoveDeployedSkill {
  private readonly deps: {
    registry: { isRegistered(path: string): Promise<boolean> };
    deployedRef: DeployedRefPort;
    // apm deletes an edited copy silently, so this guard is what stands between
    // a tidy-up and lost work (.claude/rules/apm-driver.md).
    deployedContent: DeployedContentPort;
    apm: Pick<ApmDriverPort, "removeSkill">;
    // The only mechanism allowed to clear a copy apm left behind: a bare
    // `apm uninstall -g` deletes beyond its own lockfile (apm-driver.md
    // § Danger), and apm no longer knows these tools to name them (#339).
    deployedCleanup: DeployedCleanupPort;
    // Probed live per request (ADR-0011); an empty probe is what turns a global
    // removal into a refusal instead of a no-op.
    toolPresence: ToolPresencePort;
    // realpath, so the lock cannot be sidestepped by a symlinked spelling.
    canonicalPath: (path: string) => Promise<string>;
    // Omitted, this use-case guards only against itself — enough for a test,
    // never for the composed server.
    locks?: InFlightLocks;
    location: Pick<DeployedLocation, "treeRoot">;
  };

  private readonly locks: InFlightLocks;
  private readonly consent: ReclaimConsentIssuer;

  constructor(deps: RemoveDeployedSkill["deps"]) {
    this.deps = deps;
    this.locks = deps.locks ?? new InFlightLocks();
    this.consent = new ReclaimConsentIssuer({
      treeRoot: (target) => deps.location.treeRoot(target),
    });
  }

  // A read: it never takes the apm write lock, so asking cannot block a deploy
  // already in flight.
  async preflight(
    input: RemoveDeployedSkillInput,
  ): Promise<RemovePreflightResult> {
    const rejection = await this.rejectBadRequest(input);
    if (rejection !== undefined) {
      return { ok: false, error: rejection };
    }

    let scope: ResolvedScope;
    try {
      scope = await this.resolveScope(input.target);
    } catch {
      // A probe that did not run is never answered as a clean copy (J04).
      return { ok: false, error: "preflight-failed" };
    }
    if (!scope.ok) {
      return { ok: false, error: scope.error };
    }

    try {
      const state = await this.deps.deployedContent.classify({
        target: input.target,
        name: input.name,
      });
      return {
        ok: true,
        warning: GUARD_WARNINGS[state] ?? null,
        reclaim: this.consent.offer({
          target: input.target,
          name: input.name,
          detected: scope.scope === "global" ? scope.detected : undefined,
        }),
      };
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

    let scope: ResolvedScope;
    let lockKey: string;
    try {
      scope = await this.resolveScope(input.target);
      // The global scope has no path to canonicalize; it queues on the literal
      // key the global deploy already takes.
      lockKey =
        input.target.kind === "repo"
          ? await this.deps.canonicalPath(input.target.repoPath)
          : GLOBAL_LOCK_KEY;
    } catch {
      // Registration guarantees the path exists, so this is the catch-all for a
      // broken environment.
      return { ok: false, error: "remove-failed" };
    }
    if (!scope.ok) {
      return { ok: false, error: scope.error };
    }

    const detected = scope.scope === "global" ? scope.detected : undefined;
    const run = await this.locks.run(lockKey, () =>
      this.remove(input, detected),
    );
    return run.ok ? run.value : { ok: false, error: "remove-in-progress" };
  }

  // Detection decides whether there is a scope, and nothing else — which copies
  // the guard reads is not its business. Throws only when the probe failed;
  // both callers own that as their catch-all.
  private async resolveScope(target: DeployTarget): Promise<ResolvedScope> {
    if (target.kind === "repo") {
      return { ok: true, scope: "repo" };
    }
    const detected = await this.deps.toolPresence.detectGlobalTools();
    return detected.length === 0
      ? { ok: false, error: "no-supported-tool" }
      : { ok: true, scope: "global", detected };
  }

  // The registry gate is last, but still before any filesystem or apm access:
  // an unregistered path must reach neither (security.md). Returns undefined
  // when the request is sound.
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
    // Only a repo carries a client-supplied path; the global scope's location
    // never left the server.
    if (
      input.target.kind === "repo" &&
      !(await this.deps.registry.isRegistered(input.target.repoPath))
    ) {
      return "repo-not-registered";
    }
    return undefined;
  }

  private async remove(
    input: RemoveDeployedSkillInput,
    detected: readonly SupportedTool[] | undefined,
  ): Promise<RemoveDeployedSkillResult> {
    const target = input.target;
    // Swallow rather than rethrow: a raw apm message may carry a token and must
    // never reach the transport layer (security.md).
    try {
      const lookup = await this.deps.deployedRef.resolve({
        target,
        name: input.name,
      });
      if (!lookup.ok) {
        return { ok: false, error: lookup.reason };
      }

      // The user already confirmed the consequence `preflight` stated, so an
      // edited copy goes; only an unreadable one still refuses (#337).
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

      // After apm's positive marker, never before: a removal that never
      // happened leaves a copy nothing replaced.
      await this.reclaimConfirmed(
        input.target,
        input.name,
        detected,
        input.confirmedReclaimToken,
      );
      return {
        ok: true,
        removed: {
          type: "skill",
          name: input.name,
          version: lookup.version,
          scope:
            detected === undefined
              ? { kind: "repo" }
              : { kind: "global", tools: detected },
        },
      };
    } catch {
      return { ok: false, error: "remove-failed" };
    }
  }

  // Deletes the granted set itself, never a set derived a second time — the
  // removal must not exceed what the confirmation named (#390).
  private async reclaimConfirmed(
    target: DeployTarget,
    name: string,
    detected: readonly SupportedTool[] | undefined,
    confirmedToken: string | undefined,
  ): Promise<void> {
    const granted = this.consent.grants(
      { target, name, detected },
      confirmedToken,
    );
    if (granted === null) {
      return;
    }
    await reclaimTools({
      cleanup: this.deps.deployedCleanup,
      target,
      name,
      tools: granted.map((entry) => entry.tool),
    });
  }
}
