// The remove use-case. `preflight` states what the removal would destroy;
// `execute` carries it out under the same per-target lock the deploy takes.
// See ADR-0011, ADR-0013, #337, apm-behavior.md § Remove.
import type { ToolPresencePort } from "../tools/tool-presence-port";
import type { SelectionWriter } from "./apply-selection";
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
import type { GitOrigin } from "./git-origin";
import { GLOBAL_LOCK_KEY, type InFlightLocks } from "./in-flight-locks";
import {
  type CopyFinding,
  type CopyVerdict,
  type LocalCopyCheck,
  LocalCopyGuard,
} from "./local-copy-guard";
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
  // The consumer's apm.yml holds a Harness dependency Maestro will not edit, so
  // nothing was written (ADR-0031).
  | "manifest-not-recognised"
  // A Deploy or Remove on this target never finished; it is converged before
  // anything else runs (#951).
  | "operation-unfinished"
  // apm ran and the skill's files, or its name in the manifest, are still
  // there. The operation record survives, so Retry removal converges on it.
  | "remove-incomplete"
  | "remove-failed";

// Named for the consequence the user consents to, not the classifier state.
// The two stay apart: "checked, nothing to compare against" and "could not
// check" must not share a wording (J04).
export type RemoveWarning = "cannot-verify-local-edits" | "check-did-not-run";

// A diverged copy refuses like deploy and update do: apm 0.29.0 keeps the
// edited file and aborts after deleting the rest of the copy (apm-behavior.md
// § Remove), so no consent can make that removal whole (#775).
const GUARD_REFUSALS: Partial<Record<CopyVerdict, RemoveDeployedSkillError>> = {
  "local-edits": "deployed-diverged-from-lock",
  unreadable: "deployed-unreadable",
  "lockfile-malformed": "lockfile-malformed",
};

// Absent means nothing to lose ("clean", "not-deployed") — silence in a
// confirmation reads that way, so every other state must appear here (J04).
// A state the removal refuses still warns, except the one `preflight` refuses.
const GUARD_WARNINGS: Partial<Record<CopyVerdict, RemoveWarning>> = {
  unverified: "cannot-verify-local-edits",
  unreadable: "check-did-not-run",
  "lockfile-malformed": "check-did-not-run",
};

// One detected tool's answer, so a global confirmation can state a cost on the
// row that carries it instead of over the whole set (#414).
export type RemoveToolCheck = {
  tool: SupportedTool;
  warning: RemoveWarning | null;
};

// What the check found, at the grain its scope states costs at: one answer for
// a repo, one per tool for global. Never both, because two would disagree.
export type RemoveCheck =
  | { scope: "repo"; warning: RemoveWarning | null }
  | { scope: "global"; tools: readonly RemoveToolCheck[] };

// A repo's deployed copy spans several tool subtrees, so its one row is priced
// from the one aggregate answer — the same state the guard above refuses on.
const repoCheck = (verdict: CopyVerdict): RemoveCheck => ({
  scope: "repo",
  warning: GUARD_WARNINGS[verdict] ?? null,
});

// The verdict a repo-scoped check answers with: one copy, one finding. An empty
// check is unreadable, never clean — nothing was proved (J04).
const soleVerdict = (copies: LocalCopyCheck): CopyVerdict =>
  copies.findings[0]?.verdict ?? "unreadable";

// A tool's own finding, in the order the check asked, so the confirmation's
// rows do not reshuffle under the answer.
const toolChecks = (findings: readonly CopyFinding[]): RemoveToolCheck[] =>
  findings.flatMap((finding) =>
    finding.tool === null
      ? []
      : [
          {
            tool: finding.tool,
            warning: GUARD_WARNINGS[finding.verdict] ?? null,
          },
        ],
  );

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
  | {
      ok: true;
      // What the shared guard read, and the priced shape the confirmation
      // states. Both come from one pass, so they can never disagree.
      copies: LocalCopyCheck;
      check: RemoveCheck;
      reclaim: ReclaimConsent | null;
    }
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
  // `outcome` only where apm ran; the other three only where the removal
  // stopped on a cost nobody agreed to. Together they restate the whole
  // question, so no attempt mixes a fresh cost with a stale consent (#364).
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
    // a tidy-up and lost work (.claude/rules/apm-driver.md). The same instance
    // the deploy and the Update slices classify through (#952).
    copyGuard?: Pick<LocalCopyGuard, "check">;
    // The post-removal probe only: it tells an absent copy from a clean one,
    // which the guard's verdicts deliberately collapse.
    deployedContent: Pick<DeployedContentPort, "classify" | "contentDigest">;
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
    // The shared Selection write, and the connected Harness it is written
    // against. Absent, this removal stays on the per-skill uninstall path a
    // target still holding per-skill dependencies needs (#933, #951).
    selection?: SelectionWriter;
    inventoryOrigin?: () => Promise<GitOrigin | null>;
  };

  private readonly consent: RemoveConsentIssuer;
  private readonly copyGuard: Pick<LocalCopyGuard, "check">;

  constructor(deps: RemoveDeployedSkill["deps"]) {
    this.deps = deps;
    this.copyGuard =
      deps.copyGuard ?? new LocalCopyGuard({ content: deps.deployedContent });
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
      // Best effort: the pin is what a copy may legitimately equal, and a
      // lockfile that will not answer simply leaves that pass unearned.
      const lookup = await this.deps.deployedRef
        .resolve({ target: input.target, name: input.name })
        .catch(() => null);
      const priced = await this.price(
        input,
        scope,
        lookup?.ok === true ? lookup.version : undefined,
        false,
      );
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

  // One pricing for both halves: the confirmation states it, the removal proves
  // the request agreed to the one it finds (#364). Reclaim first, because the
  // check follows it.
  private async price(
    input: RemoveDeployedSkillInput,
    scope: ResolvedScope & { ok: true },
    release: string | undefined,
    wholeCopy: boolean,
  ): Promise<Priced> {
    const reclaim = this.consent.offer({
      target: input.target,
      name: input.name,
      detected: scope.scope === "global" ? scope.detected : undefined,
    });
    const copies = await this.runCheck(
      input,
      scope,
      reclaim,
      release,
      wholeCopy,
    );
    // One diverged copy refuses the whole set: apm's uninstall has no -t, so it
    // would abort on that copy after deleting the others (#775).
    if (copies.findings.some((finding) => finding.verdict === "local-edits")) {
      return { ok: false, error: "deployed-diverged-from-lock" };
    }
    const check: RemoveCheck =
      scope.scope === "repo"
        ? repoCheck(soleVerdict(copies))
        : { scope: "global", tools: toolChecks(copies.findings) };
    return { ok: true, copies, check, reclaim };
  }

  // One answer for a repo's single copy; per tool for global, which is the
  // grain the confirmation states costs at (#414).
  private async runCheck(
    input: RemoveDeployedSkillInput,
    scope: ResolvedScope & { ok: true },
    reclaim: ReclaimConsent | null,
    release: string | undefined,
    wholeCopy: boolean,
  ): Promise<LocalCopyCheck> {
    const ask = (tools?: readonly SupportedTool[]) =>
      this.copyGuard.check({
        write: "remove",
        target: input.target,
        names: [input.name],
        ...(tools === undefined ? {} : { tools }),
        ...(release === undefined ? {} : { release }),
      });

    if (scope.scope === "repo") {
      return await ask();
    }
    // Only the write asks for the whole copy: apm's uninstall deletes by its
    // own recorded targets, so a tool that has since dropped out is still at
    // risk. A read prices what the reader sees; the write what apm reaches.
    const parts = [
      ...(wholeCopy ? [await ask()] : []),
      await ask([
        ...scope.detected,
        ...(reclaim?.previews ?? []).map((preview) => preview.tool),
      ]),
    ];
    const findings: CopyFinding[] = parts.flatMap((part) => [...part.findings]);
    const digests = parts
      .map((part) => part.digest)
      .filter((digest): digest is string => digest !== null);
    return {
      findings,
      digest: digests.length === 0 ? null : digests.sort().join("\n"),
    };
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
      this.remove(input, scope, lockKey),
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

  // Which mechanism this removal uses: one narrowing install, the named
  // uninstall for the last skill, or the per-skill uninstall a not-yet-migrated
  // target was deployed with (ADR-0031, #933).
  private async planRemoval(
    target: DeployTarget,
    name: string,
    lockKey: string,
  ): Promise<
    | { kind: "root"; origin: GitOrigin; release: string; previous: string[] }
    | { kind: "per-skill"; ref: string; version: string }
    | { kind: "refused"; error: RemoveDeployedSkillError }
  > {
    const origin = (await this.deps.inventoryOrigin?.()) ?? null;
    const selection = this.deps.selection;
    if (origin !== null && selection !== undefined) {
      const current = await selection.readTarget(target, origin);
      if (current.kind === "unreadable") {
        return { kind: "refused", error: current.reason };
      }
      if (current.kind === "root") {
        if (!current.deployed.includes(name)) {
          return { kind: "refused", error: "not-deployed" };
        }
        if ((await selection.pending(lockKey)) !== null) {
          return { kind: "refused", error: "operation-unfinished" };
        }
        return {
          kind: "root",
          origin,
          release: current.release,
          previous: current.deployed,
        };
      }
    }
    const lookup = await this.deps.deployedRef.resolve({ target, name });
    return lookup.ok
      ? { kind: "per-skill", ref: lookup.ref, version: lookup.version }
      : { kind: "refused", error: lookup.reason };
  }

  private async remove(
    input: RemoveDeployedSkillInput,
    scope: ResolvedScope & { ok: true },
    lockKey: string,
  ): Promise<RemoveDeployedSkillResult> {
    const target = input.target;
    const detected = scope.scope === "global" ? scope.detected : undefined;
    // Swallow rather than rethrow: a raw apm message may carry a token and must
    // never reach the transport layer (security.md).
    try {
      const plan = await this.planRemoval(target, input.name, lockKey);
      if (plan.kind === "refused") {
        return { ok: false, error: plan.error };
      }
      const version = plan.kind === "root" ? plan.release : plan.version;

      // Only a receipt minted for what the guard finds now lets the removal
      // through, so a baseline lost since the check stops it (#364, #952). The
      // pinned release goes in, so a copy equal to it is not read as an edit.
      const priced = await this.price(input, scope, version, true);
      if (!priced.ok) {
        return priced;
      }
      // An unverified copy goes once the consequence `preflight` stated was
      // priced for this very request; an unreadable one refuses outright, with
      // no consent that could clear it (#458, #775, #952).
      const refusal = priced.copies.findings
        .map((finding) => GUARD_REFUSALS[finding.verdict])
        .find((error) => error !== undefined);
      if (refusal !== undefined) {
        return { ok: false, error: refusal };
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

      const failure =
        plan.kind === "root"
          ? await this.narrowSelection(plan, input, lockKey, detected)
          : (await this.deps.apm.removeSkill({ target, ref: plan.ref })).ok
            ? null
            : "remove-failed";
      if (failure !== null) {
        return {
          ok: false,
          error: failure,
          // What the disk says, whatever apm claimed: a blocked uninstall
          // deletes the rest of the Selection first (apm-behavior.md).
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
          version,
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

  // One install at the same release with the narrower list, or the named
  // uninstall of the Harness dependency when the last skill goes (#957,
  // apm-behavior.md § Root package and its Selection). Null when it landed.
  private async narrowSelection(
    plan: { origin: GitOrigin; release: string; previous: string[] },
    input: RemoveDeployedSkillInput,
    lockKey: string,
    detected: readonly SupportedTool[] | undefined,
  ): Promise<RemoveDeployedSkillError | null> {
    const applied = await (this.deps.selection as SelectionWriter).apply({
      target: input.target,
      key: lockKey,
      kind: "remove",
      origin: plan.origin,
      release: plan.release,
      previous: plan.previous,
      desired: plan.previous.filter((name) => name !== input.name),
      ...(detected === undefined ? {} : { tools: detected }),
    });
    if (applied.ok) {
      return null;
    }
    return applied.error === "manifest-not-recognised"
      ? "manifest-not-recognised"
      : applied.error === "apply-incomplete"
        ? "remove-incomplete"
        : "remove-failed";
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
