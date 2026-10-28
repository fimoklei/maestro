import type { LockfileReading } from "../lockfile/lockfile";
import type { ToolPresencePort } from "../tools/tool-presence-port";
import type { SelectionWriter } from "./apply-selection";
import type {
  ApmDriverPort,
  DeployedContentPort,
  DeployedContentState,
  DeployTarget,
} from "./deploy-skill";
import type { SupportedTool } from "./deploy-tools";
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
import { RemoveConsentIssuer } from "./remove-consent";

// Reads the ref from the target's own lockfile, never from the caller.
export type DeployedRefPort = {
  resolve(input: {
    target: DeployTarget;
    name: string;
  }): Promise<DeployedRefLookup>;
};

type RemoveDeployedSkillInput = {
  // Plain string: the skill-only rule is checked here, not by the schema.
  type: string;
  name: string;
  target: DeployTarget;
  // From this request's own `preflight`; licenses deleting a copy with local
  // edits (#458).
  confirmedRemovalReceipt?: string;
};

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
  | "deployed-diverged-pinned-per-skill"
  | "cost-not-acknowledged"
  | "remove-in-progress"
  | "manifest-not-recognised"
  | "operation-unfinished"
  | "remove-incomplete"
  // Kept apart: only the release-following path keeps an operation to retry.
  | "remove-timed-out"
  | "remove-timed-out-unrecorded"
  | "remove-failed";

// Kept apart: "nothing to compare against" and "could not check" must not
// share a wording.
export type RemoveWarning = "cannot-verify-local-edits" | "check-did-not-run";

// No consent clears a diverged copy: apm keeps the edited file and aborts
// after deleting the rest of the copy (#775).
const GUARD_REFUSALS: Partial<Record<CopyVerdict, RemoveDeployedSkillError>> = {
  "local-edits": "deployed-diverged-from-lock",
  unreadable: "deployed-unreadable",
  "lockfile-malformed": "lockfile-malformed",
};

// Absent means nothing to lose, so every other state must appear here.
const GUARD_WARNINGS: Partial<Record<CopyVerdict, RemoveWarning>> = {
  unverified: "cannot-verify-local-edits",
  unreadable: "check-did-not-run",
  "lockfile-malformed": "check-did-not-run",
};

export type RemoveToolCheck = {
  tool: SupportedTool;
  warning: RemoveWarning | null;
};

export type RemoveCheck =
  | { scope: "repo"; warning: RemoveWarning | null }
  | { scope: "global"; tools: readonly RemoveToolCheck[] };

const repoCheck = (verdict: CopyVerdict): RemoveCheck => ({
  scope: "repo",
  warning: GUARD_WARNINGS[verdict] ?? null,
});

// An empty check is unreadable, never clean.
const soleVerdict = (copies: LocalCopyCheck): CopyVerdict =>
  copies.findings[0]?.verdict ?? "unreadable";

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

// A probe that could not answer is "unknown", never "removed".
export type RemoveTargetState = "removed" | "not-removed" | "unknown";

export type RemoveToolOutcome = {
  tool: SupportedTool;
  state: RemoveTargetState;
};

export type RemoveOutcome =
  | { scope: "repo"; state: RemoveTargetState }
  | { scope: "global"; tools: readonly RemoveToolOutcome[] };

// apm's uninstall reports one outcome for all tools, so each is read off disk.
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
  | LocalEditsRefusal
  | "preflight-failed";

type Priced =
  | {
      ok: true;
      copies: LocalCopyCheck;
      check: RemoveCheck;
    }
  | { ok: false; error: LocalEditsRefusal };

type LocalEditsRefusal =
  | "deployed-diverged-from-lock"
  | "deployed-diverged-pinned-per-skill";

type ResolvedScope =
  | { ok: true; scope: "repo" }
  | { ok: true; scope: "global"; detected: readonly SupportedTool[] }
  | { ok: false; error: "no-supported-tool" };

type RemovedScope =
  | { kind: "repo" }
  | { kind: "global"; tools: readonly SupportedTool[] };

// `version` and `scope` are what the removal ran against, never what the caller
// had in view (#383).
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
  // `outcome` only where apm ran; the other two only on a cost nobody agreed
  // to, so no attempt mixes a fresh cost with a stale consent (#364).
  | {
      ok: false;
      error: RemoveDeployedSkillError;
      outcome?: RemoveOutcome;
      check?: RemoveCheck;
      receipt?: string;
    };

type RemovePreflightResult =
  | {
      ok: true;
      check: RemoveCheck;
      receipt: string;
    }
  | { ok: false; error: RemovePreflightError };

// Each receipt belongs to this target's own preflight: one target's
// confirmation never licenses another's removal (#458).
export type BulkRemoveTarget = {
  target: DeployTarget;
  confirmedRemovalReceipt?: string;
  refused?: RemovePreflightError;
};

type BulkRemovedRow = { target: DeployTarget; version: string };
type BulkRemoveRefusedRow = {
  target: DeployTarget;
  reason: RemovePreflightError;
};
type BulkRemoveFailedRow = {
  target: DeployTarget;
  reason: RemoveDeployedSkillError;
  outcome?: RemoveOutcome;
};

// One row per target: identical reasons are never collapsed.
export type BulkRemoveReport = {
  name: string;
  removed: BulkRemovedRow[];
  refused: BulkRemoveRefusedRow[];
  failed: BulkRemoveFailedRow[];
};

export class RemoveDeployedSkill {
  private readonly deps: {
    registry: { isRegistered(path: string): Promise<boolean> };
    deployedRef: DeployedRefPort;
    // apm deletes an edited copy silently; this guard stops lost work (#952).
    copyGuard?: Pick<LocalCopyGuard, "check">;
    // Post-removal probe: tells an absent copy from a clean one, which the
    // guard's verdicts collapse.
    deployedContent: Pick<
      DeployedContentPort,
      "readLockfile" | "classify" | "contentDigest" | "linkedSkillPath"
    >;
    apm: Pick<ApmDriverPort, "removeSkill">;
    toolPresence: ToolPresencePort;
    // realpath, so the lock cannot be sidestepped by a symlinked spelling.
    canonicalPath: (path: string) => Promise<string>;
    // Shared with the deploy use-case: both rewrite the same apm.lock.yaml.
    locks: InFlightLocks;
    // Absent: the per-skill uninstall path (#933, #951).
    selection?: SelectionWriter;
    harnessOrigin?: () => Promise<GitOrigin | null>;
  };

  private readonly consent = new RemoveConsentIssuer();
  private readonly copyGuard: Pick<LocalCopyGuard, "check">;

  constructor(deps: RemoveDeployedSkill["deps"]) {
    this.deps = deps;
    this.copyGuard =
      deps.copyGuard ?? new LocalCopyGuard({ content: deps.deployedContent });
  }

  // A read: never takes the apm write lock, so it cannot block a deploy.
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
      return { ok: false, error: "preflight-failed" };
    }
    if (!scope.ok) {
      return { ok: false, error: scope.error };
    }

    try {
      const lookup = await this.deps.deployedRef
        .resolve({ target: input.target, name: input.name })
        .catch(() => null);
      const priced = await this.price(
        input,
        scope,
        lookup?.ok === true ? lookup.version : undefined,
      );
      if (!priced.ok) {
        return priced;
      }
      return {
        ok: true,
        check: priced.check,
        receipt: this.consent.receipt(input, priced.check),
      };
    } catch {
      return { ok: false, error: "preflight-failed" };
    }
  }

  // Shared by both halves, so the check names the copies the removal guards
  // and the removal proves the request agreed to the cost it finds (#364, #1680).
  private async price(
    input: RemoveDeployedSkillInput,
    scope: ResolvedScope & { ok: true },
    release: string | undefined,
  ): Promise<Priced> {
    const copies = await this.runCheck(input, scope, release);
    // One diverged copy refuses the whole set: apm's uninstall has no -t, so it
    // would abort on that copy after deleting the others (#775).
    if (copies.findings.some((finding) => finding.verdict === "local-edits")) {
      return { ok: false, error: await this.localEditsRefusal(input.target) };
    }
    const check: RemoveCheck =
      scope.scope === "repo"
        ? repoCheck(soleVerdict(copies))
        : { scope: "global", tools: toolChecks(copies.findings) };
    return { ok: true, copies, check };
  }

  // A target pinned per skill refuses every deploy, so Deploy again cannot
  // reset its edits (#966).
  private async localEditsRefusal(
    target: DeployTarget,
  ): Promise<LocalEditsRefusal> {
    const origin = (await this.deps.harnessOrigin?.()) ?? null;
    const current =
      origin === null
        ? undefined
        : await this.deps.selection?.readTarget(target, origin);
    return current?.kind === "pinned-per-skill"
      ? "deployed-diverged-pinned-per-skill"
      : "deployed-diverged-from-lock";
  }

  private async runCheck(
    input: RemoveDeployedSkillInput,
    scope: ResolvedScope & { ok: true },
    release: string | undefined,
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
    // The whole copy too: apm uninstalls by its own recorded targets, so a
    // tool that has since dropped out is still at risk.
    const parts = [await ask(), await ask(scope.detected)];
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
      lockKey =
        input.target.kind === "repo"
          ? await this.deps.canonicalPath(input.target.repoPath)
          : GLOBAL_LOCK_KEY;
    } catch {
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

  // Each target runs the single removal unchanged. Sequential on purpose: the
  // run must not contend with its own target lock.
  async executeBatch(input: {
    name: string;
    targets: readonly BulkRemoveTarget[];
  }): Promise<BulkRemoveReport> {
    const report: BulkRemoveReport = {
      name: input.name,
      removed: [],
      refused: [],
      failed: [],
    };

    for (const entry of input.targets) {
      if (entry.refused !== undefined) {
        report.refused.push({ target: entry.target, reason: entry.refused });
        continue;
      }

      const result = await this.execute({
        type: "skill",
        name: input.name,
        target: entry.target,
        confirmedRemovalReceipt: entry.confirmedRemovalReceipt,
      }).catch(
        (): RemoveDeployedSkillResult => ({
          ok: false,
          error: "remove-failed",
        }),
      );

      if (result.ok) {
        report.removed.push({
          target: entry.target,
          version: result.removed.version,
        });
      } else {
        report.failed.push({
          target: entry.target,
          reason: result.error,
          ...(result.outcome ? { outcome: result.outcome } : {}),
        });
      }
    }

    return report;
  }

  private async resolveScope(target: DeployTarget): Promise<ResolvedScope> {
    if (target.kind === "repo") {
      return { ok: true, scope: "repo" };
    }
    const detected = await this.deps.toolPresence.detectGlobalTools();
    return detected.length === 0
      ? { ok: false, error: "no-supported-tool" }
      : { ok: true, scope: "global", detected };
  }

  // Runs before any filesystem or apm access: an unregistered path must reach
  // neither.
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
    if (
      input.target.kind === "repo" &&
      !(await this.deps.registry.isRegistered(input.target.repoPath))
    ) {
      return "repo-not-registered";
    }
    return undefined;
  }

  private async planRemoval(
    target: DeployTarget,
    name: string,
    lockKey: string,
  ): Promise<
    | { kind: "root"; origin: GitOrigin; release: string; previous: string[] }
    | { kind: "per-skill"; ref: string; version: string }
    | { kind: "refused"; error: RemoveDeployedSkillError }
  > {
    const origin = (await this.deps.harnessOrigin?.()) ?? null;
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
    // Never rethrow: a raw apm message may carry a token.
    try {
      const plan = await this.planRemoval(target, input.name, lockKey);
      if (plan.kind === "refused") {
        return { ok: false, error: plan.error };
      }
      const version = plan.kind === "root" ? plan.release : plan.version;

      // Priced again under the lock, so a baseline lost since the check stops
      // the removal (#364, #952).
      const priced = await this.price(input, scope, version);
      if (!priced.ok) {
        return priced;
      }
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
        // Restates the whole question, so the next attempt cannot pair this
        // cost with an older consent (#364).
        return {
          ok: false,
          error: "cost-not-acknowledged",
          check: priced.check,
          receipt: this.consent.receipt(consentScope, priced.check),
        };
      }

      const failure =
        plan.kind === "root"
          ? await this.narrowSelection(plan, input, lockKey, detected)
          : await this.uninstallPackage(target, plan.ref);
      if (failure !== null) {
        return {
          ok: false,
          error: failure,
          // From disk, not apm: a blocked uninstall deletes the rest of the
          // Selection first.
          outcome: await this.probeOutcome(target, input.name, detected),
        };
      }

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

  // Null when it landed.
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
        : applied.error === "apply-timed-out"
          ? "remove-timed-out"
          : "remove-failed";
  }

  // Null when apm proved the removal.
  private async uninstallPackage(
    target: DeployTarget,
    ref: string,
  ): Promise<RemoveDeployedSkillError | null> {
    const removed = await this.deps.apm.removeSkill({ target, ref });
    if (removed.ok) {
      return null;
    }
    return removed.reason === "timed-out"
      ? "remove-timed-out-unrecorded"
      : "remove-failed";
  }

  private async probeOutcome(
    target: DeployTarget,
    name: string,
    detected: readonly SupportedTool[] | undefined,
  ): Promise<RemoveOutcome> {
    const lockfile = await this.deps.deployedContent.readLockfile(target);
    if (detected === undefined) {
      return {
        scope: "repo",
        state: await this.probeTarget(target, lockfile, name),
      };
    }
    const tools: RemoveToolOutcome[] = [];
    for (const tool of detected) {
      tools.push({
        tool,
        state: await this.probeTarget(target, lockfile, name, [tool]),
      });
    }
    return { scope: "global", tools };
  }

  private async probeTarget(
    target: DeployTarget,
    lockfile: LockfileReading,
    name: string,
    tools?: readonly SupportedTool[],
  ): Promise<RemoveTargetState> {
    try {
      return PROBE_STATES[
        await this.deps.deployedContent.classify({
          target,
          name,
          tools,
          lockfile,
        })
      ];
    } catch {
      return "unknown";
    }
  }
}
