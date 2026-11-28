import type { InventoryResult } from "../inventory/inventory-reader";
import type { ToolPresencePort } from "../tools/tool-presence-port";
import type { SelectionResult, SelectionWriter } from "./apply-selection";
import type {
  ApmDriverPort,
  DeployedContentPort,
  DeployTarget,
  InventoryGitPort,
  LinkedDestination,
  RecordedPackagePort,
} from "./deploy-ports";
import {
  type GlobalLayout,
  SUPPORTED_TOOLS,
  type SupportedTool,
} from "./deploy-tools";
import type { GitOrigin } from "./git-origin";
import { type BlockingCopy, blockingCopies, heldByCopies } from "./held-copies";
import { GLOBAL_LOCK_KEY, type InFlightLocks } from "./in-flight-locks";
import {
  type CopyBlock,
  type CopyFinding,
  copiesOf,
  copyKey,
  copyKeys,
  LocalCopyGuard,
  linkedField,
  linkedIn,
  worstVerdict,
} from "./local-copy-guard";
import { isValidSkillSlug } from "./package-ref";
import type { PlaceReader } from "./place-reading";
import {
  reportWrite,
  type WriteReport,
  writtenEverywhere,
} from "./write-report";

export type {
  ApmDriverPort,
  DeployedCleanupPort,
  DeployedContentPort,
  DeployedContentState,
  DeploySkillDriverResult,
  DeployTarget,
  InventoryGitPort,
  LinkedDestination,
  RecordedPackagePort,
  RecordedPackageResult,
  RemoveSkillDriverResult,
  ResolveLatestTagResult,
} from "./deploy-ports";

type DeploySkillInput = {
  type: string;
  name: string;
  target: DeployTarget;
  confirmedCopyReceipt?: string;
};

export type DeploySkillError =
  | "unsupported-primitive-type"
  | "invalid-name"
  | "unknown-skill"
  | "inventory-not-configured"
  | "inventory-unreadable"
  | "repo-not-registered"
  | "inventory-origin-unavailable"
  | "no-published-tag"
  | "not-at-target-release"
  | "target-pinned-per-skill"
  | "manifest-not-recognised"
  | "manifest-legacy-entry"
  | "ref-unresolvable"
  | "operation-unfinished"
  | "deploy-incomplete"
  | "local-diverged-from-tag"
  | "target-behind-release"
  | "deployed-diverged-from-lock"
  | "deployed-unverifiable"
  | "deployed-unreadable"
  | "lockfile-malformed"
  | "deploy-in-progress"
  | "no-supported-tool"
  | "auth-required"
  | "destination-symlinked"
  | "tag-check-timed-out"
  | "deploy-timed-out"
  | "deploy-failed"
  | "deploy-not-started";

export type DeploySkillResult =
  | {
      ok: true;
      deployed: { type: "skill"; name: string; version: string };
      report?: WriteReport;
    }
  | {
      ok: false;
      error: DeploySkillError;
      linked?: LinkedDestination;
      copyReceipt?: string;
      blockingCopies?: BlockingCopy[];
    };

export type HeldSkill = { name: string; confirmedCopyReceipt: string };

type Consent = {
  whole: string | undefined;
  each: readonly HeldSkill[];
};

const NO_CONSENT: Consent = { whole: undefined, each: [] };

type BatchDeployResult = { name: string; result: DeploySkillResult };

type BulkAttentionRow = {
  name: string;
  error: DeploySkillError;
  forceable: boolean;
  copyReceipt?: string;
  blockingCopies?: BlockingCopy[];
};
type BulkFailure = {
  error: DeploySkillError;
  names: string[];
  linked?: LinkedDestination;
};

export type BulkDeployReport = {
  target: DeployTarget;
  deployed: { name: string; version: string }[];
  attention: BulkAttentionRow[];
  failed: BulkFailure[];
  unfinished?: true;
  report?: WriteReport;
};

type RunSink = {
  release?: string;
  tools?: readonly SupportedTool[];
  previous?: readonly string[];
  wrote?: readonly string[];
  unfinished?: true;
};

const ATTENTION: Partial<Record<DeploySkillError, { forceable: boolean }>> = {
  "deployed-diverged-from-lock": { forceable: true },
  "deployed-unverifiable": { forceable: true },
  "not-at-target-release": { forceable: false },
  "target-behind-release": { forceable: false },
  "target-pinned-per-skill": { forceable: false },
  "deploy-in-progress": { forceable: false },
  "manifest-not-recognised": { forceable: false },
  "manifest-legacy-entry": { forceable: false },
  "operation-unfinished": { forceable: false },
};

type SelectionError = Extract<SelectionResult, { ok: false }>["error"];

const COPY_ERRORS: Record<CopyBlock, DeploySkillError> = {
  linked: "destination-symlinked",
  "local-edits": "deployed-diverged-from-lock",
  unverified: "deployed-unverifiable",
  unreadable: "deployed-unreadable",
  "lockfile-malformed": "lockfile-malformed",
};

export class DeploySkill {
  private readonly deps: {
    inventory: { read(): Promise<InventoryResult> };
    registry: { isRegistered(path: string): Promise<boolean> };
    apm: Pick<ApmDriverPort, "resolveLatestTag" | "deploySkill">;
    inventoryGit: InventoryGitPort;
    // Best-effort fetch and fast-forward of the clone before the checks
    // below; never throws (#666).
    syncHarness: () => Promise<void>;
    copyGuard?: Pick<LocalCopyGuard, "check" | "admits">;
    deployedContent: DeployedContentPort;
    recordedPackage: RecordedPackagePort;
    toolPresence: ToolPresencePort;
    globalLayout: () => GlobalLayout;
    harnessOrigin: () => Promise<GitOrigin | null>;
    canonicalPath: (path: string) => Promise<string>;
    // Shared with the remove use-case: both rewrite the same apm.lock.yaml.
    locks: InFlightLocks;
    selection: SelectionWriter;
    outcomes: Pick<PlaceReader, "read">;
  };

  private readonly copyGuard: Pick<LocalCopyGuard, "check" | "admits">;

  constructor(deps: DeploySkill["deps"]) {
    this.deps = deps;
    this.copyGuard =
      deps.copyGuard ?? new LocalCopyGuard({ content: deps.deployedContent });
  }

  async execute(input: DeploySkillInput): Promise<DeploySkillResult> {
    if (input.type !== "skill") {
      return { ok: false, error: "unsupported-primitive-type" };
    }
    const sink: RunSink = {};
    const rows = await this.run(
      [input.name],
      input.target,
      { whole: input.confirmedCopyReceipt, each: [] },
      sink,
    );
    const result = rows[0]?.result ?? {
      ok: false,
      error: "deploy-not-started",
    };
    if (!result.ok) {
      return result;
    }
    const report = await this.reportOf(input.target, rows, sink);
    return report === undefined ? result : { ...result, report };
  }

  async executeBatch(input: {
    names: readonly string[];
    target: DeployTarget;
  }): Promise<BulkDeployReport> {
    return this.report(input.names, input.target, NO_CONSENT);
  }

  async deployAgain(input: {
    target: DeployTarget;
    held: readonly HeldSkill[];
  }): Promise<BulkDeployReport> {
    return this.report(
      input.held.map((row) => row.name),
      input.target,
      { whole: undefined, each: input.held },
    );
  }

  private async report(
    names: readonly string[],
    target: DeployTarget,
    consent: Consent,
  ): Promise<BulkDeployReport> {
    const input = { names, target };
    let rows: BatchDeployResult[];
    const sink: RunSink = {};
    try {
      rows = await this.run(input.names, input.target, consent, sink);
    } catch {
      rows = input.names.map((name) => ({
        name,
        result: { ok: false, error: "deploy-not-started" },
      }));
    }

    const report = await this.reportOf(input.target, rows, sink);
    const deployed: BulkDeployReport["deployed"] = [];
    const attention: BulkAttentionRow[] = [];
    const failures = new Map<string, BulkFailure>();
    for (const { name, result } of rows) {
      if (result.ok) {
        deployed.push({ name, version: result.deployed.version });
        continue;
      }
      if (
        result.error === "deploy-incomplete" &&
        sink.release !== undefined &&
        report !== undefined &&
        writtenEverywhere(report, name)
      ) {
        deployed.push({ name, version: sink.release });
        continue;
      }
      const offer = ATTENTION[result.error];
      if (offer) {
        attention.push({
          name,
          error: result.error,
          ...(result.copyReceipt ? { copyReceipt: result.copyReceipt } : {}),
          ...(result.blockingCopies
            ? { blockingCopies: result.blockingCopies }
            : {}),
          forceable: offer.forceable,
        });
        continue;
      }
      const key = `${result.error}\0${result.linked?.kind ?? ""}\0${result.linked?.path ?? ""}`;
      const line = failures.get(key) ?? {
        error: result.error,
        names: [],
        ...(result.linked ? { linked: result.linked } : {}),
      };
      line.names.push(name);
      failures.set(key, line);
    }
    return {
      target: input.target,
      deployed,
      attention,
      failed: [...failures.values()],
      ...(sink.unfinished ? { unfinished: true } : {}),
      ...(report === undefined ? {} : { report }),
    };
  }

  private async reportOf(
    target: DeployTarget,
    rows: readonly BatchDeployResult[],
    sink: RunSink,
  ): Promise<WriteReport | undefined> {
    if (target.kind === "global" && sink.tools === undefined) {
      return undefined;
    }
    const wrote = new Set(sink.wrote ?? []);
    const refused = new Map<string, DeploySkillError>();
    for (const { name, result } of rows) {
      if (!result.ok && !wrote.has(name)) {
        refused.set(name, result.error);
      }
    }
    const names = union(
      sink.previous ?? [],
      rows.map((row) => row.name),
    );
    const readings = await this.deps.outcomes
      .read({
        target,
        release: sink.release ?? null,
        names:
          sink.release === undefined
            ? []
            : names.filter((name) => !refused.has(name)),
        tools: sink.tools ?? SUPPORTED_TOOLS,
      })
      .catch(() => null);
    return readings === null
      ? undefined
      : reportWrite({ readings, names, wrote, refused });
  }

  private async run(
    names: readonly string[],
    target: DeployTarget,
    consent: Consent,
    sink: RunSink,
  ): Promise<BatchDeployResult[]> {
    const results = new Map<string, DeploySkillResult>();
    const valid = [...new Set(names)].filter((name) => {
      if (isValidSkillSlug(name)) {
        return true;
      }
      results.set(name, { ok: false, error: "invalid-name" });
      return false;
    });
    if (valid.length > 0) {
      for (const [name, result] of await this.locked(
        valid,
        target,
        consent,
        sink,
      )) {
        results.set(name, result);
      }
    }
    return names.map((name) => ({
      name,
      result: results.get(name) ?? { ok: false, error: "deploy-not-started" },
    }));
  }

  private async locked(
    names: readonly string[],
    target: DeployTarget,
    consent: Consent,
    sink: RunSink,
  ): Promise<Map<string, DeploySkillResult>> {
    const every = (error: DeploySkillError) =>
      new Map(names.map((name) => [name, { ok: false as const, error }]));

    let lockKey: string;
    if (target.kind === "repo") {
      if (!(await this.deps.registry.isRegistered(target.repoPath))) {
        return every("repo-not-registered");
      }
      try {
        lockKey = await this.deps.canonicalPath(target.repoPath);
      } catch {
        return every("deploy-not-started");
      }
    } else {
      lockKey = GLOBAL_LOCK_KEY;
    }

    const run = await this.deps.locks.run(lockKey, () =>
      this.deploy(names, target, lockKey, consent, sink),
    );
    return run.ok ? run.value : every("deploy-in-progress");
  }

  private async deploy(
    names: readonly string[],
    target: DeployTarget,
    lockKey: string,
    consent: Consent,
    sink: RunSink,
  ): Promise<Map<string, DeploySkillResult>> {
    const results = new Map<string, DeploySkillResult>();
    const refuseRest = (error: DeploySkillError) => {
      for (const name of names) {
        if (!results.has(name)) {
          results.set(name, { ok: false, error });
        }
      }
      return results;
    };

    const inventory = await this.deps.inventory.read();
    if (!inventory.ok) {
      return refuseRest(
        inventory.error === "unreadable"
          ? "inventory-unreadable"
          : "inventory-not-configured",
      );
    }
    for (const name of names) {
      if (
        !inventory.primitives.some((p) => p.type === "skill" && p.name === name)
      ) {
        results.set(name, { ok: false, error: "unknown-skill" });
      }
    }
    const known = names.filter((name) => !results.has(name));
    if (known.length === 0) {
      return results;
    }

    const origin = await this.deps.harnessOrigin();
    if (origin === null) {
      return refuseRest("inventory-origin-unavailable");
    }

    try {
      let globalTools: readonly SupportedTool[] | undefined;
      if (target.kind === "global") {
        const detected = await this.deps.toolPresence.detectGlobalTools();
        if (detected.length === 0) {
          return refuseRest("no-supported-tool");
        }
        globalTools = detected;
        sink.tools = detected;
      }
      const toolScope = globalTools === undefined ? {} : { tools: globalTools };

      const current = await this.deps.selection.readTarget(target, origin);
      if (current.kind === "unreadable") {
        return refuseRest(current.reason);
      }
      if (current.kind === "pinned-per-skill") {
        return refuseRest("target-pinned-per-skill");
      }
      if ((await this.deps.selection.pending(lockKey)) !== null) {
        return refuseRest("operation-unfinished");
      }

      let tag: string;
      if (current.kind === "root") {
        tag = current.release;
      } else {
        const tagResult = await this.deps.apm.resolveLatestTag(
          origin.ownerRepo,
        );
        if (!tagResult.ok) {
          return refuseRest(
            tagResult.reason === "auth-required"
              ? "auth-required"
              : tagResult.reason === "no-tag"
                ? "no-published-tag"
                : tagResult.reason === "timed-out"
                  ? "tag-check-timed-out"
                  : await this.failureAt(lockKey),
          );
        }
        tag = tagResult.tag;
      }
      sink.release = tag;
      await this.deps.syncHarness();

      const latest = once(() => this.latestTag(origin.ownerRepo));
      const tagged: string[] = [];
      for (const name of known) {
        const refusal = await this.nameRefusal(
          name,
          tag,
          current.kind === "root" ? latest : null,
        );
        if (refusal === null) {
          tagged.push(name);
        } else {
          results.set(name, refusal);
        }
      }
      if (tagged.length === 0) {
        return results;
      }

      const deployed = current.kind === "root" ? current.deployed : [];
      sink.previous = deployed;
      const scope = { write: "deploy", target } as const;
      const checkOver = (names: readonly string[]) =>
        this.copyGuard.check({
          ...scope,
          names: union(deployed, names),
          ...toolScope,
          release: tag,
        });
      let check = await checkOver(tagged);
      const candidates: string[] = [];
      for (const name of tagged) {
        const linked = linkedIn(
          this.copyGuard.admits(scope, copiesOf(check, [name])),
        );
        if (linked) {
          results.set(name, linkedRefusal(linked));
        } else {
          candidates.push(name);
        }
      }
      if (candidates.length === 0) {
        return results;
      }
      if (
        tagged.some(
          (name) => !candidates.includes(name) && !deployed.includes(name),
        )
      ) {
        check = await checkOver(candidates);
      }
      const admitted = this.copyGuard.admits(scope, check, consent.whole);
      const linked = linkedIn(admitted);
      if (linked) {
        for (const name of candidates) {
          results.set(name, linkedRefusal(linked));
        }
        return results;
      }
      let isBlocking: (finding: CopyFinding) => boolean = () => false;
      let held: string[] = [];
      if (!admitted.ok) {
        isBlocking = await this.blockingFilter(target, candidates);
        const consented = new Set<string>();
        for (const row of consent.each) {
          if (!candidates.includes(row.name)) continue;
          const own = await checkOver([row.name]);
          if (this.copyGuard.admits(scope, own, row.confirmedCopyReceipt).ok) {
            for (const key of copyKeys(own)) consented.add(key);
          }
        }
        held = heldByCopies(
          candidates,
          deployed,
          check.findings.filter(
            (f) => isBlocking(f) && !consented.has(copyKey(f)),
          ),
        );
      }
      const go = candidates.filter((name) => !held.includes(name));

      let landed = deployed;
      if (go.length > 0) {
        const desired = union(deployed, go);
        const applied = await this.deps.selection
          .apply({
            target,
            key: lockKey,
            kind: "deploy",
            origin,
            release: tag,
            previous: deployed,
            desired,
            ...toolScope,
          })
          .catch((): SelectionResult => ({ ok: false, error: "apply-failed" }));
        if (applied.ok || applied.error === "apply-incomplete") {
          sink.wrote = go;
        }
        if (!applied.ok && applied.error === "apply-incomplete") {
          sink.unfinished = true;
        }
        if (applied.ok) {
          for (const name of go) {
            results.set(name, {
              ok: true,
              deployed: { type: "skill", name, version: tag },
            });
          }
          landed = desired;
        } else {
          for (const name of go) {
            results.set(
              name,
              await this.installRefusal(
                applied.error,
                lockKey,
                target,
                name,
                globalTools,
              ),
            );
          }
        }
      }

      for (const name of held) {
        const decision =
          candidates.length === 1
            ? admitted
            : this.copyGuard.admits(
                scope,
                await this.copyGuard.check({
                  ...scope,
                  names: union(landed, [name]),
                  ...toolScope,
                  release: tag,
                }),
              );
        const findings = decision.ok
          ? check.findings.filter((f) => f.name === name)
          : decision.check.findings;
        const blocked = decision.ok ? worstVerdict(findings) : decision.blocked;
        results.set(name, {
          ok: false,
          error: COPY_ERRORS[blocked ?? "unreadable"],
          ...linkedField(decision),
          ...(decision.ok || decision.receipt === null
            ? {}
            : {
                copyReceipt: decision.receipt,
                blockingCopies: blockingCopies(
                  findings.filter(isBlocking),
                  this.deps.globalLayout(),
                ),
              }),
        });
      }
      return results;
    } catch {
      return refuseRest(await this.failureAt(lockKey));
    }
  }

  private async failureAt(lockKey: string): Promise<DeploySkillError> {
    try {
      return (await this.deps.selection.pending(lockKey)) === null
        ? "deploy-not-started"
        : "deploy-failed";
    } catch {
      return "deploy-failed";
    }
  }

  private async nameRefusal(
    name: string,
    tag: string,
    latest: (() => Promise<string | null>) | null,
  ): Promise<DeploySkillResult | null> {
    const git = this.deps.inventoryGit;
    if (!(await git.skillExistsAtTag(tag, name))) {
      return {
        ok: false,
        error: latest ? "not-at-target-release" : "no-published-tag",
      };
    }
    if (!(await git.skillDivergesFromTag(tag, name))) {
      return null;
    }
    const newer = latest === null ? null : await latest();
    return newer !== null &&
      newer !== tag &&
      !(await git.skillDivergesFromTag(newer, name))
      ? { ok: false, error: "target-behind-release" }
      : { ok: false, error: "local-diverged-from-tag" };
  }

  private async latestTag(ownerRepo: string): Promise<string | null> {
    try {
      const result = await this.deps.apm.resolveLatestTag(ownerRepo);
      return result.ok ? result.tag : null;
    } catch {
      return null;
    }
  }

  private async blockingFilter(
    target: DeployTarget,
    candidates: readonly string[],
  ): Promise<(finding: CopyFinding) => boolean> {
    const lockfile = await this.deps.deployedContent.readLockfile(target);
    const standings = await Promise.all(
      candidates.map(async (name) => ({
        name,
        standing: await this.deps.recordedPackage.read({ lockfile, name }),
      })),
    );
    const apmOwns = new Set(
      standings
        .filter(
          ({ standing }) =>
            standing.kind === "recorded" && standing.reading.kind !== "skill",
        )
        .map(({ name }) => name),
    );
    return (f) =>
      f.verdict !== "clean" &&
      !(f.verdict === "unverified" && apmOwns.has(f.name));
  }

  private async installRefusal(
    error: SelectionError,
    lockKey: string,
    target: DeployTarget,
    name: string,
    tools: readonly SupportedTool[] | undefined,
  ): Promise<DeploySkillResult> {
    if (error === "destination-symlinked") {
      const linked = await this.deps.deployedContent.linkedDestination({
        target,
        name,
        tools,
      });
      return linked === null
        ? { ok: false, error: "destination-symlinked" }
        : linkedRefusal(linked);
    }
    return {
      ok: false,
      error:
        error === "manifest-not-recognised" || error === "manifest-legacy-entry"
          ? error
          : error === "apply-incomplete"
            ? "deploy-incomplete"
            : error === "apply-timed-out"
              ? "deploy-timed-out"
              : await this.failureAt(lockKey),
    };
  }
}

function linkedRefusal(linked: LinkedDestination): DeploySkillResult {
  return { ok: false, error: "destination-symlinked", linked };
}

function once<T>(read: () => Promise<T>): () => Promise<T> {
  let value: Promise<T> | undefined;
  return () => {
    value ??= read();
    return value;
  };
}

function union(left: readonly string[], right: readonly string[]): string[] {
  return [...new Set([...left, ...right])];
}
