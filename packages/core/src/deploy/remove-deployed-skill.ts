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
import { GLOBAL_LOCK_KEY, type InFlightLocks } from "./in-flight-locks";
import { isValidSkillSlug } from "./package-ref";
import { reclaimTools } from "./reclaim-untargeted-copies";
import { type ReclaimConsent, RemoveConsentIssuer } from "./remove-consent";

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
  // Receipt from this request's own `preflight`. Distinct from the reclaim
  // token: this one licenses deleting a copy carrying local edits (#458).
  confirmedRemovalReceipt?: string;
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
  | "deployed-diverged-from-lock"
  | "cost-not-acknowledged"
  | "remove-in-progress"
  | "remove-failed";

// Named for the consequence the user consents to, not the classifier state.
// The two stay apart: "checked, nothing to compare against" and "could not
// check" must not share a wording (J04).
export type RemoveWarning = "cannot-verify-local-edits" | "check-did-not-run";

// A diverged copy refuses like deploy and update do: apm 0.29.0 keeps the
// edited file and aborts after deleting the rest of the copy (apm-behavior.md
// § Remove), so no consent can make that removal whole (#775).
const GUARD_REFUSALS: Partial<
  Record<DeployedContentState, RemoveDeployedSkillError>
> = {
  diverged: "deployed-diverged-from-lock",
  unreadable: "deployed-unreadable",
  "lockfile-malformed": "lockfile-malformed",
};

// Absent means nothing to lose ("clean", "not-deployed") — silence in a
// confirmation reads that way, so every other state must appear here (J04).
// A state the removal refuses still warns, except the one `preflight` refuses.
const GUARD_WARNINGS: Partial<Record<DeployedContentState, RemoveWarning>> = {
  unverifiable: "cannot-verify-local-edits",
  unreadable: "check-did-not-run",
  "lockfile-malformed": "check-did-not-run",
};

// One detected tool's answer, so a global confirmation can state a cost on the
// row that carries it instead of over the whole set (#414).
export type RemoveToolCheck = {
  tool: SupportedTool;
  warning: RemoveWarning | null;
};

// What the check found, shaped by the scope it ran against. A repo has one row
// and its deployed copy spans several tool subtrees, so one aggregate answer is
// the honest thing to state; the global scope has a row per tool, so it answers
// per tool. One field rather than an aggregate beside a breakdown, because two
// would eventually disagree.
export type RemoveCheck =
  | { scope: "repo"; warning: RemoveWarning | null }
  | { scope: "global"; tools: readonly RemoveToolCheck[] };

// A repo's deployed copy spans several tool subtrees, so its one row is priced
// from the one aggregate answer — the same state the guard above refuses on.
const repoCheck = (state: DeployedContentState): RemoveCheck => ({
  scope: "repo",
  warning: GUARD_WARNINGS[state] ?? null,
});

// What a probe of one target's disk found once apm failed to confirm. A probe
// that could not answer is "unknown", never "removed" (J04).
export type RemoveTargetState = "removed" | "not-removed" | "unknown";

export type RemoveToolOutcome = {
  tool: SupportedTool;
  state: RemoveTargetState;
};

// Shaped by the scope it ran against, like `RemoveCheck`: a repo has one row,
// the global scope one per detected tool.
export type RemoveOutcome =
  | { scope: "repo"; state: RemoveTargetState }
  | { scope: "global"; tools: readonly RemoveToolOutcome[] };

// apm's uninstall reports one outcome for every tool at once, so the per-target
// answer is read off the disk instead (ADR-0013, apm-behavior.md § Remove).
const PROBE_STATES: Record<DeployedContentState, RemoveTargetState> = {
  "not-deployed": "removed",
  clean: "not-removed",
  diverged: "not-removed",
  unverifiable: "not-removed",
  unreadable: "unknown",
  "lockfile-malformed": "unknown",
};

// A failed check never falls back to "no warning" — it proves nothing.
export type RemovePreflightError =
  | "unsupported-primitive-type"
  | "invalid-name"
  | "repo-not-registered"
  | "no-supported-tool"
  | "deployed-diverged-from-lock"
  | "preflight-failed";

// The check's answer: a price the confirmation can state, or the one state
// that has no price because apm would leave the copy half-deleted.
type Priced =
  | { ok: true; check: RemoveCheck; reclaim: ReclaimConsent | null }
  | { ok: false; error: "deployed-diverged-from-lock" };

// `detected` is not what the guard reads — apm deletes by its own recorded
// targets. It feeds the cleanup after a successful removal (#339); required on
// the global arm so the reclaim cannot be skipped by omitting a property.
type ResolvedScope =
  | { ok: true; scope: "repo" }
  | { ok: true; scope: "global"; detected: readonly SupportedTool[] }
  | { ok: false; error: "no-supported-tool" };

// Global carries the tools the live probe found at execution time — the only
// set apm can have reached (ADR-0011).
type RemovedScope =
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
  // `outcome` is present only where apm ran and left something to probe; a
  // failure that never reached it has no outcome to report. The other three
  // appear only where the removal stopped because the cost it found was never
  // agreed to: together they are the whole restated question, so the next
  // attempt never mixes a fresh cost with a stale consent (#364).
  | {
      ok: false;
      error: RemoveDeployedSkillError;
      outcome?: RemoveOutcome;
      check?: RemoveCheck;
      receipt?: string;
      reclaim?: ReclaimConsent | null;
    };

type RemovePreflightResult =
  | {
      ok: true;
      check: RemoveCheck;
      // Paths and token in one field, so neither can reach the confirmation
      // without the other.
      reclaim: ReclaimConsent | null;
      // Beside the check, never instead of it: the proof only exists on an
      // answer that also stated the cost (#458).
      receipt: string;
    }
  | { ok: false; error: RemovePreflightError };

export class RemoveDeployedSkill {
  private readonly deps: {
    registry: { isRegistered(path: string): Promise<boolean> };
    deployedRef: DeployedRefPort;
    // apm deletes an edited copy silently, so this guard is what stands between
    // a tidy-up and lost work (.claude/rules/apm-driver.md).
    // Only the classification: the linked-destination probe is the deploy's,
    // and a removal never installs (#748).
    deployedContent: Pick<DeployedContentPort, "classify">;
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
    // Shared with the deploy use-case: both rewrite the same apm.lock.yaml.
    locks: InFlightLocks;
    location: Pick<DeployedLocation, "treeRoot">;
  };

  private readonly consent: RemoveConsentIssuer;

  constructor(deps: RemoveDeployedSkill["deps"]) {
    this.deps = deps;
    this.consent = new RemoveConsentIssuer({
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
      const priced = await this.price(input, scope);
      if (!priced.ok) {
        return priced;
      }
      return {
        ok: true,
        check: priced.check,
        reclaim: priced.reclaim,
        receipt: this.consent.receipt(input, priced.check),
      };
    } catch {
      return { ok: false, error: "preflight-failed" };
    }
  }

  // One pricing, run by both halves against the same seam: the confirmation
  // states it, and the removal proves the request agreed to the one it finds
  // (#364). The reclaim comes first because the check follows it — a copy the
  // removal would delete is a copy to price, whether or not this machine still
  // has the tool that reads it.
  private async price(
    input: RemoveDeployedSkillInput,
    scope: ResolvedScope & { ok: true },
  ): Promise<Priced> {
    const reclaim = this.consent.offer({
      target: input.target,
      name: input.name,
      detected: scope.scope === "global" ? scope.detected : undefined,
    });
    const check = await this.runCheck(input, scope, reclaim);
    return check === "deployed-diverged-from-lock"
      ? { ok: false, error: check }
      : { ok: true, check, reclaim };
  }

  // The global scope asks per tool, because that is the grain the confirmation
  // states costs at: one entry per detected tool, then one per leftover copy
  // the reclaim would delete. Deleting a copy in full and deleting work
  // nothing else holds are different prices, and only the check tells them
  // apart (#414). One diverged copy refuses the whole set: apm's uninstall
  // has no -t, so it would abort on that copy after deleting the others.
  private async runCheck(
    input: RemoveDeployedSkillInput,
    scope: ResolvedScope & { ok: true },
    reclaim: ReclaimConsent | null,
  ): Promise<RemoveCheck | "deployed-diverged-from-lock"> {
    if (scope.scope === "repo") {
      const state = await this.deps.deployedContent.classify({
        target: input.target,
        name: input.name,
      });
      return state === "diverged"
        ? "deployed-diverged-from-lock"
        : repoCheck(state);
    }
    const priced = [
      ...scope.detected,
      ...(reclaim?.previews ?? []).map((preview) => preview.tool),
    ];
    const tools: RemoveToolCheck[] = [];
    for (const tool of priced) {
      const warning = await this.checkTool(input, tool);
      if (warning === "deployed-diverged-from-lock") {
        return warning;
      }
      tools.push({ tool, warning });
    }
    return { scope: "global", tools };
  }

  // Caught per tool: one unreadable copy answers for itself and takes no other
  // tool's answer with it. A check that could not run is never reported as a
  // clean copy (J04).
  private async checkTool(
    input: RemoveDeployedSkillInput,
    tool: SupportedTool,
  ): Promise<RemoveWarning | null | "deployed-diverged-from-lock"> {
    try {
      const state = await this.deps.deployedContent.classify({
        target: input.target,
        name: input.name,
        tools: [tool],
      });
      return state === "diverged"
        ? "deployed-diverged-from-lock"
        : (GUARD_WARNINGS[state] ?? null);
    } catch {
      return "check-did-not-run";
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

    const run = await this.deps.locks.run(lockKey, () =>
      this.remove(input, scope),
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
    scope: ResolvedScope & { ok: true },
  ): Promise<RemoveDeployedSkillResult> {
    const target = input.target;
    const detected = scope.scope === "global" ? scope.detected : undefined;
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

      // An unverifiable copy goes once the consequence `preflight` stated was
      // priced for this very request; an edited or unreadable one refuses
      // outright (#458, #775).
      const deployedState = await this.deps.deployedContent.classify({
        target,
        name: input.name,
      });
      const refusal = GUARD_REFUSALS[deployedState];
      if (refusal !== undefined) {
        return { ok: false, error: refusal };
      }

      // Priced again, and only a receipt minted for what is found now lets the
      // removal through. A baseline lost between the check and the click
      // therefore stops it, and so does a request that acknowledged nothing
      // (#364). The repo scope reuses the state the guard just read and has no
      // leftovers by definition; the global scope prices per tool, the grain
      // the confirmation states costs at.
      const priced: Priced =
        scope.scope === "repo"
          ? { ok: true, check: repoCheck(deployedState), reclaim: null }
          : await this.price(input, scope);
      if (!priced.ok) {
        return priced;
      }
      const consentScope = { target, name: input.name };
      if (
        !this.consent.accepts(
          consentScope,
          priced.check,
          input.confirmedRemovalReceipt,
        )
      ) {
        // The whole question again, so confirming the restated cost is one more
        // click rather than a second pricing round — and so the next attempt
        // cannot pair this cost with the consent of an older one (#364).
        return {
          ok: false,
          error: "cost-not-acknowledged",
          check: priced.check,
          receipt: this.consent.receipt(consentScope, priced.check),
          reclaim: priced.reclaim,
        };
      }

      const removed = await this.deps.apm.removeSkill({
        target,
        ref: lookup.ref,
      });
      if (!removed.ok) {
        return {
          ok: false,
          error: "remove-failed",
          outcome: await this.probeOutcome(target, input.name, detected),
        };
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

  // apm can remove a copy and still fail to say so, and the disk is the only
  // thing that knows which targets it came off. Detected order is kept, so the
  // confirmation's rows do not reshuffle under the answer.
  private async probeOutcome(
    target: DeployTarget,
    name: string,
    detected: readonly SupportedTool[] | undefined,
  ): Promise<RemoveOutcome> {
    if (detected === undefined) {
      return { scope: "repo", state: await this.probeTarget(target, name) };
    }
    const tools: RemoveToolOutcome[] = [];
    for (const tool of detected) {
      tools.push({ tool, state: await this.probeTarget(target, name, [tool]) });
    }
    return { scope: "global", tools };
  }

  // Caught per target: one unreadable copy answers for itself, and a probe that
  // threw is unknown rather than a target the removal came off.
  private async probeTarget(
    target: DeployTarget,
    name: string,
    tools?: readonly SupportedTool[],
  ): Promise<RemoveTargetState> {
    try {
      return PROBE_STATES[
        await this.deps.deployedContent.classify({ target, name, tools })
      ];
    } catch {
      return "unknown";
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
