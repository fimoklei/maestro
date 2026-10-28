import type { OutdatedResult } from "../drift/parse-outdated";
import type { InventoryResult } from "../inventory/inventory-reader";
import type { LockfileReading, PackageReading } from "../lockfile/lockfile";
import type { ToolPresencePort } from "../tools/tool-presence-port";
import type { SelectionResult, SelectionWriter } from "./apply-selection";
import type { SupportedTool } from "./deploy-tools";
import type { GitOrigin } from "./git-origin";
import { GLOBAL_LOCK_KEY, type InFlightLocks } from "./in-flight-locks";
import {
  type CopyFinding,
  type CopyVerdict,
  LocalCopyGuard,
  linkedPathAmong,
  worstVerdict,
} from "./local-copy-guard";
import { isValidSkillSlug } from "./package-ref";

// Only the repo arm carries a client-supplied path; the global location is
// resolved server-side.
export type DeployTarget =
  | { kind: "repo"; repoPath: string }
  | { kind: "global" };

// "auth-required" is apm's two fixed phrases only; "timed-out" is a hung apm
// the driver stopped; every other apm or git error is "failed".
export type ResolveLatestTagResult =
  | { ok: true; tag: string }
  | { ok: false; reason: "no-tag" | "auth-required" | "timed-out" | "failed" };

// "failed" stays unclassified: a refusal apm did not name is never dressed up
// as a diagnosed one (#180).
export type DeploySkillDriverResult =
  | { ok: true }
  | { ok: false; reason: "destination-symlinked" | "timed-out" | "failed" };

// Only a timeout has a reason: every uninstall outcome exits 0 and the only
// signal is the positive marker.
export type RemoveSkillDriverResult =
  | { ok: true }
  | { ok: false; reason?: "timed-out" };

export type ApmDriverPort = {
  resolveLatestTag(ownerRepo: string): Promise<ResolveLatestTagResult>;
  // `tools` scopes apm's `-t`: present on the global path, absent on the repo
  // path, where the driver targets every DEPLOY_TOOLS tool (#131).
  deploySkill(input: {
    target: DeployTarget;
    ref: string;
    // The whole desired Selection, never a subset: the `--skill` flag unions
    // with the list apm persisted, so a name left out stays installed.
    skills?: readonly string[];
    tools?: readonly SupportedTool[];
  }): Promise<DeploySkillDriverResult>;
  // `ref` must be the tag-pinned one the install used: a bare name is rejected
  // and still exits 0.
  removeSkill(input: {
    target: DeployTarget;
    ref: string;
  }): Promise<RemoveSkillDriverResult>;
  // Version pairs, never raw apm output.
  checkOutdated(target: DeployTarget): Promise<OutdatedResult>;
};

// The git questions apm cannot answer, asked of the local inventory clone.
export type InventoryGitPort = {
  skillExistsAtTag(tag: string, name: string): Promise<boolean>;
  // Tree-diff, never apm's opaque content_hash.
  skillDivergesFromTag(tag: string, name: string): Promise<boolean>;
  // sha256 per path, relative to the skill directory. Null where nothing could
  // be read, which keeps the copy protected (#952).
  readSkillFilesAtTag(
    tag: string,
    name: string,
  ): Promise<Record<string, string> | null>;
};

// The three unhappy states stay apart from "not-deployed", so a guard refuses
// instead of reading an unchecked copy as an empty one (#58, #59).
export type DeployedContentState =
  | "not-deployed"
  | "clean"
  | "diverged"
  | "unverifiable"
  | "unreadable"
  | "lockfile-malformed";

export type DeployedContentPort = {
  // Never rejects: a present but unreadable lockfile reads as malformed (#58).
  readLockfile(target: DeployTarget): Promise<LockfileReading>;
  // `tools` scopes the scan and its baseline, so an untargeted tool's absent
  // copy cannot force a false `diverged` (#136).
  classify(input: {
    target: DeployTarget;
    name: string;
    tools?: readonly SupportedTool[];
    // A copy equal to this release in full is `clean`; an unreadable release
    // grants no such pass (#952).
    release?: string;
    // Read once per target and shared by every skill classified against it.
    lockfile: LockfileReading;
  }): Promise<DeployedContentState>;
  // Consent is given for content, not a verdict: two different edits both
  // read `diverged`. Null where nothing could be read.
  contentDigest(input: {
    target: DeployTarget;
    name: string;
    tools?: readonly SupportedTool[];
  }): Promise<string | null>;
  // The symlinked leaf skill directory apm refuses to write into, or null.
  // Computed from disk, never from apm's prose (#748).
  linkedSkillPath(input: {
    target: DeployTarget;
    name: string;
    tools?: readonly SupportedTool[];
  }): Promise<string | null>;
};

// Anything short of an entry we read is "unverified", never success: apm's own
// marker is what this read exists to distrust (#358).
export type RecordedPackageResult =
  | { kind: "recorded"; reading: PackageReading }
  | { kind: "unverified" };

export type RecordedPackagePort = {
  read(input: {
    lockfile: LockfileReading;
    name: string;
  }): Promise<RecordedPackageResult>;
};

// A subtree-scoped removal, never `apm uninstall -g`, which deletes beyond its
// lockfile. Idempotent (#136).
export type DeployedCleanupPort = {
  removeSkillTargets(input: {
    target: DeployTarget;
    name: string;
    tools: readonly SupportedTool[];
  }): Promise<void>;
};

type DeploySkillInput = {
  // Plain string: the skill-only rule is checked here, not by the schema.
  type: string;
  name: string;
  target: DeployTarget;
  // Minted by this deploy's own refusal; content that changed since retires
  // it (#952).
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
  | "ref-unresolvable"
  | "operation-unfinished"
  | "deploy-incomplete"
  | "local-diverged-from-tag"
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
  // Split by the operation record: pending means files may be on disk.
  | "deploy-failed"
  | "deploy-not-started";

export type DeploySkillResult =
  | { ok: true; deployed: { type: "skill"; name: string; version: string } }
  // `copyReceipt` licenses exactly the copies just read (#952).
  | {
      ok: false;
      error: DeploySkillError;
      linkedPath?: string;
      copyReceipt?: string;
      blockingCopies?: BlockingCopy[];
    };

// A skill whose copy the receipt covers: its force replaces every one.
type BlockingCopy = { name: string; verdict: "local-edits" | "unverified" };

type BatchDeployResult = { name: string; result: DeploySkillResult };

type BulkAttentionRow = {
  name: string;
  error: DeploySkillError;
  forceable: boolean;
  // Minted by this row's own refusal; grants only what that refusal read (#952).
  copyReceipt?: string;
  blockingCopies?: BlockingCopy[];
};
type BulkFailure = {
  error: DeploySkillError;
  names: string[];
  linkedPath?: string;
};

export type BulkDeployReport = {
  target: DeployTarget;
  deployed: { name: string; version: string }[];
  attention: BulkAttentionRow[];
  failed: BulkFailure[];
};

// Refusals the user acts on, and whether a force is the action. Every error
// absent here is a genuine failure.
const ATTENTION: Partial<Record<DeploySkillError, { forceable: boolean }>> = {
  "deployed-diverged-from-lock": { forceable: true },
  "deployed-unverifiable": { forceable: true },
  "not-at-target-release": { forceable: false },
  "target-pinned-per-skill": { forceable: false },
  "deploy-in-progress": { forceable: false },
  "manifest-not-recognised": { forceable: false },
  "operation-unfinished": { forceable: false },
};

type SelectionError = Extract<SelectionResult, { ok: false }>["error"];

const COPY_ERRORS: Record<Exclude<CopyVerdict, "clean">, DeploySkillError> = {
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
    // Inject the shared guard so a receipt one flow minted is the proof
    // another checks (#952).
    copyGuard?: Pick<LocalCopyGuard, "check" | "admits">;
    deployedContent: DeployedContentPort;
    recordedPackage: RecordedPackagePort;
    // Global path only.
    toolPresence: ToolPresencePort;
    harnessOrigin: () => Promise<GitOrigin | null>;
    // realpath, so the lock cannot be sidestepped by a symlinked spelling.
    canonicalPath: (path: string) => Promise<string>;
    // Shared with the remove use-case: both rewrite the same apm.lock.yaml.
    locks: InFlightLocks;
    selection: SelectionWriter;
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
    const [answer] = await this.run(
      [input.name],
      input.target,
      input.confirmedCopyReceipt,
    );
    return answer?.result ?? { ok: false, error: "deploy-not-started" };
  }

  // No consent: a bulk deploy never overwrites a copy with local edits; force
  // stays per-item, on the single deploy (#292).
  async executeBatch(input: {
    names: readonly string[];
    target: DeployTarget;
  }): Promise<BulkDeployReport> {
    let rows: BatchDeployResult[];
    try {
      rows = await this.run(input.names, input.target, undefined);
    } catch {
      // Only the reads before the lock can throw here: nothing was written.
      rows = input.names.map((name) => ({
        name,
        result: { ok: false, error: "deploy-not-started" },
      }));
    }

    const deployed: BulkDeployReport["deployed"] = [];
    const attention: BulkAttentionRow[] = [];
    // Keyed by error and link, so identical failures collapse to one line.
    const failures = new Map<string, BulkFailure>();
    for (const { name, result } of rows) {
      if (result.ok) {
        deployed.push({ name, version: result.deployed.version });
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
      const key = `${result.error}\0${result.linkedPath ?? ""}`;
      const line = failures.get(key) ?? {
        error: result.error,
        names: [],
        ...(result.linkedPath ? { linkedPath: result.linkedPath } : {}),
      };
      line.names.push(name);
      failures.set(key, line);
    }
    return {
      target: input.target,
      deployed,
      attention,
      failed: [...failures.values()],
    };
  }

  // One answer per name, in the order given.
  private async run(
    names: readonly string[],
    target: DeployTarget,
    receipt: string | undefined,
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
      for (const [name, result] of await this.locked(valid, target, receipt)) {
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
    receipt: string | undefined,
  ): Promise<Map<string, DeploySkillResult>> {
    const every = (error: DeploySkillError) =>
      new Map(names.map((name) => [name, { ok: false as const, error }]));

    let lockKey: string;
    if (target.kind === "repo") {
      // Before any filesystem or apm access: an unregistered path must reach
      // neither.
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
      this.deploy(names, target, lockKey, receipt),
    );
    return run.ok ? run.value : every("deploy-in-progress");
  }

  // Target-wide checks run once; every name that passes its own guards goes
  // into one install (#1039).
  private async deploy(
    names: readonly string[],
    target: DeployTarget,
    lockKey: string,
    receipt: string | undefined,
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

    // Never rethrow: a raw apm message may carry a token.
    try {
      let globalTools: readonly SupportedTool[] | undefined;
      if (target.kind === "global") {
        const detected = await this.deps.toolPresence.detectGlobalTools();
        if (detected.length === 0) {
          return refuseRest("no-supported-tool");
        }
        globalTools = detected;
      }
      const toolScope = globalTools === undefined ? {} : { tools: globalTools };

      // A skill is added at the release the target already follows, even a
      // Behind one, so adding a skill never adopts an unpreviewed release.
      const current = await this.deps.selection.readTarget(target, origin);
      if (current.kind === "unreadable") {
        return refuseRest(current.reason);
      }
      if (current.kind === "pinned-per-skill") {
        return refuseRest("target-pinned-per-skill");
      }
      // An unfinished operation converges first, so a retry never has to
      // reconcile two intents (#951).
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
      await this.deps.syncHarness();

      const tagged: string[] = [];
      for (const name of known) {
        const refusal = await this.nameRefusal(
          name,
          tag,
          current.kind === "root",
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

      // One install rewrites every copy in the Selection, and a same-ref apm
      // install resets an edited copy silently (#56), so the guard reads them
      // all. A copy equal to this release is not an edit (#952).
      const deployed = current.kind === "root" ? current.deployed : [];
      const scope = { write: "deploy", target } as const;
      const checkOver = (names: readonly string[]) =>
        this.copyGuard.check({
          ...scope,
          names: union(deployed, names),
          ...toolScope,
          release: tag,
        });
      let check = await checkOver(tagged);
      // A root-package install skips a symlinked destination and still reports
      // success, so the link is refused here.
      const candidates: string[] = [];
      for (const name of tagged) {
        const linkedPath = linkedPathAmong(check, [name]);
        if (linkedPath) {
          results.set(name, {
            ok: false,
            error: "destination-symlinked",
            linkedPath,
          });
        } else {
          candidates.push(name);
        }
      }
      if (candidates.length === 0) {
        return results;
      }
      // A refused name outside the Selection is no copy at risk, so it must
      // not bind the receipt a later single deploy checks.
      if (
        tagged.some(
          (name) => !candidates.includes(name) && !deployed.includes(name),
        )
      ) {
        check = await checkOver(candidates);
      }
      const admitted = this.copyGuard.admits(scope, check, receipt);
      let isBlocking: (finding: CopyFinding) => boolean = () => false;
      let held: string[] = [];
      if (!admitted.ok) {
        isBlocking = await this.blockingFilter(target, candidates);
        held = heldByCopies(
          candidates,
          deployed,
          check.findings.filter(isBlocking),
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
          // Held-back names keep their own refusal rather than joining the
          // catch-all below.
          .catch((): SelectionResult => ({ ok: false, error: "apply-failed" }));
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
        // Otherwise the receipt is minted against what a single deploy of this
        // name now reads, so the row's own deploy is licensed by it.
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
          ...(decision.ok || decision.receipt === null
            ? {}
            : {
                copyReceipt: decision.receipt,
                blockingCopies: blockingCopies(findings.filter(isBlocking)),
              }),
        });
      }
      return results;
    } catch {
      return refuseRest(await this.failureAt(lockKey));
    }
  }

  // A pending operation means this run may have written: the reader retries
  // it. Without one, nothing of this run is on disk.
  private async failureAt(lockKey: string): Promise<DeploySkillError> {
    try {
      return (await this.deps.selection.pending(lockKey)) === null
        ? "deploy-not-started"
        : "deploy-failed";
    } catch {
      return "deploy-failed";
    }
  }

  // Null lets the name into the install.
  private async nameRefusal(
    name: string,
    tag: string,
    followsRelease: boolean,
  ): Promise<DeploySkillResult | null> {
    if (!(await this.deps.inventoryGit.skillExistsAtTag(tag, name))) {
      return {
        ok: false,
        error: followsRelease ? "not-at-target-release" : "no-published-tag",
      };
    }
    if (await this.deps.inventoryGit.skillDivergesFromTag(tag, name)) {
      return { ok: false, error: "local-diverged-from-tag" };
    }
    return null;
  }

  private async blockingFilter(
    target: DeployTarget,
    candidates: readonly string[],
  ): Promise<(finding: CopyFinding) => boolean> {
    // Files apm placed under a package type it could not manage are apm's own,
    // not local work; refusing over them would strand the target (#358).
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
      // Omitted rather than guessed when nothing on disk is a link (#748).
      const linkedPath = await this.deps.deployedContent.linkedSkillPath({
        target,
        name,
        tools,
      });
      return {
        ok: false,
        error: "destination-symlinked",
        ...(linkedPath === null ? {} : { linkedPath }),
      };
    }
    return {
      ok: false,
      error:
        error === "manifest-not-recognised"
          ? "manifest-not-recognised"
          : error === "apply-incomplete"
            ? "deploy-incomplete"
            : error === "apply-timed-out"
              ? "deploy-timed-out"
              : await this.failureAt(lockKey),
    };
  }
}

function union(left: readonly string[], right: readonly string[]): string[] {
  return [...new Set([...left, ...right])];
}

// A blocked deployed copy holds every name, since the one install rewrites it;
// only a copy the Selection does not hold yet can be left out.
function heldByCopies(
  candidates: readonly string[],
  deployed: readonly string[],
  blocking: readonly CopyFinding[],
): string[] {
  if (blocking.some((f) => deployed.includes(f.name))) {
    return [...candidates];
  }
  return candidates.filter((name) => blocking.some((f) => f.name === name));
}

// One per skill, at its worst tool's verdict.
function blockingCopies(blocking: readonly CopyFinding[]): BlockingCopy[] {
  return [...new Set(blocking.map((f) => f.name))].flatMap((name) => {
    const verdict = worstVerdict(blocking.filter((f) => f.name === name));
    return verdict === "local-edits" || verdict === "unverified"
      ? [{ name, verdict }]
      : [];
  });
}
