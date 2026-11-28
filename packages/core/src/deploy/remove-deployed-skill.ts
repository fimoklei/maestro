import type { LockfileReading } from "../lockfile/lockfile";
import type { ToolPresencePort } from "../tools/tool-presence-port";
import type { SelectionWriter } from "./apply-selection";
import type {
  ApmDriverPort,
  DeployedContentPort,
  DeployedContentState,
  DeployTarget,
  LinkedDestination,
} from "./deploy-skill";
import {
  type GlobalLayout,
  globalFolderPath,
  SUPPORTED_TOOLS,
  type SupportedTool,
} from "./deploy-tools";
import type { DeployedRefLookup } from "./deployed-ref";
import {
  formerClaudeRootsHolding,
  formerFolderPath,
} from "./former-claude-folders";
import type { GitOrigin } from "./git-origin";
import { GLOBAL_LOCK_KEY, type InFlightLocks } from "./in-flight-locks";
import {
  type CopyFinding,
  type CopyVerdict,
  type LocalCopyCheck,
  LocalCopyGuard,
  linkedIn,
} from "./local-copy-guard";
import { isValidSkillSlug } from "./package-ref";
import { RemoveConsentIssuer } from "./remove-consent";
import type { WriteReport } from "./write-report";

export type DeployedRefPort = {
  resolve(input: {
    target: DeployTarget;
    name: string;
  }): Promise<DeployedRefLookup>;
};

type RemoveDeployedSkillInput = {
  type: string;
  name: string;
  target: DeployTarget;
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
  | "manifest-legacy-entry"
  | "operation-unfinished"
  | "destination-symlinked"
  | "remove-incomplete"
  | "remove-timed-out"
  | "remove-timed-out-unrecorded"
  | "remove-failed";

export type RemoveWarning = "cannot-verify-local-edits" | "check-did-not-run";

const GUARD_REFUSALS: Partial<Record<CopyVerdict, RemoveDeployedSkillError>> = {
  "local-edits": "deployed-diverged-from-lock",
  unreadable: "deployed-unreadable",
  "lockfile-malformed": "lockfile-malformed",
};

const GUARD_WARNINGS: Partial<Record<CopyVerdict, RemoveWarning>> = {
  unverified: "cannot-verify-local-edits",
  unreadable: "check-did-not-run",
  "lockfile-malformed": "check-did-not-run",
};

export type RemoveToolCheck = {
  tool: SupportedTool;
  path: string;
  detected: boolean;
  former?: true;
  warning: RemoveWarning | null;
};

export type RemoveCheck =
  | { scope: "repo"; warning: RemoveWarning | null }
  | { scope: "global"; tools: readonly RemoveToolCheck[] };

const repoCheck = (verdict: CopyVerdict): RemoveCheck => ({
  scope: "repo",
  warning: GUARD_WARNINGS[verdict] ?? null,
});

const soleVerdictOrUnreadable = (copies: LocalCopyCheck): CopyVerdict =>
  copies.findings[0]?.verdict ?? "unreadable";

const editedTools = (findings: readonly CopyFinding[]): SupportedTool[] =>
  findings.flatMap((finding) =>
    finding.verdict === "local-edits" &&
    finding.tool !== null &&
    finding.deployRoot === undefined
      ? [finding.tool]
      : [],
  );

const editedFormerFolders = (findings: readonly CopyFinding[]): string[] =>
  findings.flatMap((finding) =>
    finding.verdict === "local-edits" && finding.deployRoot !== undefined
      ? [formerFolderPath(finding.deployRoot)]
      : [],
  );

type EditedFolders = {
  folders?: string[];
  notWritten?: string[];
  former?: string[];
};

function editedFolders(
  findings: readonly CopyFinding[],
  detected: readonly SupportedTool[],
  layout: GlobalLayout,
): EditedFolders {
  const tools = editedTools(findings);
  const notWritten = tools.filter((tool) => !detected.includes(tool));
  const former = editedFormerFolders(findings);
  const pathOf = (tool: SupportedTool) => globalFolderPath(tool, layout);
  const folders = [...tools.map(pathOf), ...former];
  return {
    ...(folders.length === 0 ? {} : { folders }),
    ...(notWritten.length === 0 ? {} : { notWritten: notWritten.map(pathOf) }),
    ...(former.length === 0 ? {} : { former }),
  };
}

type RemoveState = "removed" | "not-removed" | "not-confirmed";

const PROBE_STATES: Record<DeployedContentState, RemoveState> = {
  "not-deployed": "removed",
  clean: "not-removed",
  diverged: "not-removed",
  unverifiable: "not-removed",
  unreadable: "not-confirmed",
  "lockfile-malformed": "not-confirmed",
};

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
      linked?: LinkedDestination;
    }
  | ({ ok: false; error: LocalEditsRefusal } & EditedFolders);

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

type RemoveDeployedSkillResult =
  | {
      ok: true;
      removed: {
        type: "skill";
        name: string;
        version: string;
        scope: RemovedScope;
      };
      report: WriteReport;
    }
  | ({
      ok: false;
      error: RemoveDeployedSkillError;
      linked?: LinkedDestination;
      report?: WriteReport;
      check?: RemoveCheck;
      receipt?: string;
    } & EditedFolders);

type RemovePreflightResult =
  | {
      ok: true;
      check: RemoveCheck;
      receipt: string;
    }
  | ({ ok: false; error: RemovePreflightError } & EditedFolders);

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
  report?: WriteReport;
};

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
    copyGuard?: Pick<LocalCopyGuard, "check" | "admits">;
    deployedContent: Pick<
      DeployedContentPort,
      "readLockfile" | "classify" | "contentDigest" | "linkedDestination"
    >;
    apm: Pick<ApmDriverPort, "removeSkill">;
    toolPresence: ToolPresencePort;
    globalLayout: () => GlobalLayout;
    canonicalPath: (path: string) => Promise<string>;
    locks: InFlightLocks;
    selection?: SelectionWriter;
    harnessOrigin?: () => Promise<GitOrigin | null>;
  };

  private readonly consent = new RemoveConsentIssuer();
  private readonly copyGuard: Pick<LocalCopyGuard, "check" | "admits">;

  constructor(deps: RemoveDeployedSkill["deps"]) {
    this.deps = deps;
    this.copyGuard =
      deps.copyGuard ?? new LocalCopyGuard({ content: deps.deployedContent });
  }

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
        await this.isNamedUninstall(input.target, input.name),
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

  private async price(
    input: RemoveDeployedSkillInput,
    scope: ResolvedScope & { ok: true },
    release: string | undefined,
    namedUninstall: boolean,
  ): Promise<Priced> {
    const copies = await this.runCheck(input, scope, release, namedUninstall);
    const linked = linkedIn(
      this.copyGuard.admits({ write: "remove", target: input.target }, copies),
    );
    if (
      linked === undefined &&
      copies.findings.some((finding) => finding.verdict === "local-edits")
    ) {
      return {
        ok: false,
        error: await this.localEditsRefusal(input.target),
        ...editedFolders(
          copies.findings,
          scope.scope === "global" ? scope.detected : SUPPORTED_TOOLS,
          this.deps.globalLayout(),
        ),
      };
    }
    const check: RemoveCheck =
      scope.scope === "repo"
        ? repoCheck(soleVerdictOrUnreadable(copies))
        : {
            scope: "global",
            tools: await this.folderChecks(input, scope.detected, copies),
          };
    return { ok: true, copies, check, ...(linked ? { linked } : {}) };
  }

  private async folderChecks(
    input: RemoveDeployedSkillInput,
    detected: readonly SupportedTool[],
    copies: LocalCopyCheck,
  ): Promise<RemoveToolCheck[]> {
    const lockfile = await this.deps.deployedContent.readLockfile(input.target);
    const checks: RemoveToolCheck[] = [];
    for (const finding of copies.findings) {
      if (finding.tool === null) {
        continue;
      }
      if (finding.deployRoot !== undefined) {
        checks.push({
          tool: finding.tool,
          path: formerFolderPath(finding.deployRoot),
          detected: false,
          former: true,
          warning: GUARD_WARNINGS[finding.verdict] ?? null,
        });
        continue;
      }
      const isDetected = detected.includes(finding.tool);
      if (
        !isDetected &&
        (await this.probeTarget(input.target, lockfile, input.name, [
          finding.tool,
        ])) === "removed"
      ) {
        continue;
      }
      checks.push({
        tool: finding.tool,
        path: globalFolderPath(finding.tool, this.deps.globalLayout()),
        detected: isDetected,
        warning: GUARD_WARNINGS[finding.verdict] ?? null,
      });
    }
    return checks;
  }

  private async isNamedUninstall(
    target: DeployTarget,
    name: string,
  ): Promise<boolean> {
    const origin = (await this.deps.harnessOrigin?.()) ?? null;
    const current =
      origin === null
        ? undefined
        : await this.deps.selection?.readTarget(target, origin);
    return current?.kind === "root"
      ? current.deployed.every((each) => each === name)
      : true;
  }

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
    namedUninstall: boolean,
  ): Promise<LocalCopyCheck> {
    const tools =
      scope.scope === "repo"
        ? undefined
        : namedUninstall
          ? [
              ...scope.detected,
              ...SUPPORTED_TOOLS.filter(
                (tool) => !scope.detected.includes(tool),
              ),
            ]
          : scope.detected;
    const formerClaudeRoots =
      scope.scope === "global" && namedUninstall
        ? await this.formerClaudeRoots(input)
        : [];
    return await this.copyGuard.check({
      write: "remove",
      target: input.target,
      names: [input.name],
      ...(tools === undefined ? {} : { tools }),
      ...(formerClaudeRoots.length === 0 ? {} : { formerClaudeRoots }),
      ...(release === undefined ? {} : { release }),
    });
  }

  private async formerClaudeRoots(
    input: RemoveDeployedSkillInput,
  ): Promise<string[]> {
    const lockfile = await this.deps.deployedContent.readLockfile(input.target);
    return lockfile !== "missing" && lockfile.ok
      ? formerClaudeRootsHolding(
          lockfile.deployments,
          this.deps.globalLayout(),
          input.name,
        )
      : [];
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
          ...(result.report ? { report: result.report } : {}),
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
    | {
        kind: "root";
        selection: SelectionWriter;
        origin: GitOrigin;
        release: string;
        previous: string[];
      }
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
          selection,
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
    try {
      const plan = await this.planRemoval(target, input.name, lockKey);
      if (plan.kind === "refused") {
        return { ok: false, error: plan.error };
      }
      const version = plan.kind === "root" ? plan.release : plan.version;

      const priced = await this.price(
        input,
        scope,
        version,
        plan.kind === "per-skill" ||
          plan.previous.every((each) => each === input.name),
      );
      if (!priced.ok) {
        return priced;
      }
      if (priced.linked !== undefined) {
        return {
          ok: false,
          error: "destination-symlinked",
          linked: priced.linked,
        };
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
      if (failure === "destination-symlinked") {
        const linked = await this.deps.deployedContent.linkedDestination({
          target,
          name: input.name,
          ...(detected === undefined ? {} : { tools: detected }),
        });
        if (linked !== null) {
          return { ok: false, error: failure, linked };
        }
      }
      if (failure !== null) {
        return {
          ok: false,
          error:
            failure === "destination-symlinked" ? "remove-failed" : failure,
          report: await this.probeReport(
            target,
            input.name,
            version,
            priced.check.scope === "global"
              ? priced.check.tools.map((folder) => folder.tool)
              : undefined,
          ),
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
        report: await this.probeReport(target, input.name, version, detected),
      };
    } catch {
      return { ok: false, error: "remove-failed" };
    }
  }

  private async narrowSelection(
    plan: {
      selection: SelectionWriter;
      origin: GitOrigin;
      release: string;
      previous: string[];
    },
    input: RemoveDeployedSkillInput,
    lockKey: string,
    detected: readonly SupportedTool[] | undefined,
  ): Promise<RemoveDeployedSkillError | null> {
    const applied = await plan.selection.apply({
      target: input.target,
      key: lockKey,
      kind: "remove",
      origin: plan.origin,
      release: plan.release,
      previous: plan.previous,
      desired: plan.previous.filter((name) => name !== input.name),
      ...(detected === undefined ? {} : { tools: detected }),
      consented: [],
    });
    if (applied.ok) {
      return null;
    }
    return applied.error === "manifest-not-recognised" ||
      applied.error === "manifest-legacy-entry" ||
      applied.error === "destination-symlinked"
      ? applied.error
      : applied.error === "apply-incomplete"
        ? "remove-incomplete"
        : applied.error === "apply-timed-out"
          ? "remove-timed-out"
          : "remove-failed";
  }

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
      : removed.reason === "destination-symlinked"
        ? "destination-symlinked"
        : "remove-failed";
  }

  private async probeReport(
    target: DeployTarget,
    name: string,
    release: string,
    folders: readonly SupportedTool[] | undefined,
  ): Promise<WriteReport> {
    const lockfile = await this.deps.deployedContent.readLockfile(target);
    const places: WriteReport["places"] = [];
    for (const tool of folders ?? SUPPORTED_TOOLS) {
      places.push({
        tool,
        path:
          folders === undefined
            ? null
            : globalFolderPath(tool, this.deps.globalLayout()),
        detected: true,
        skills: [
          {
            name,
            state: await this.probeTarget(target, lockfile, name, [tool]),
          },
        ],
      });
    }
    return { release, places };
  }

  private async probeTarget(
    target: DeployTarget,
    lockfile: LockfileReading,
    name: string,
    tools?: readonly SupportedTool[],
  ): Promise<RemoveState> {
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
      return "not-confirmed";
    }
  }
}
