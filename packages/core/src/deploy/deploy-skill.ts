import type { OutdatedResult } from "../drift/parse-outdated";
import type { InventoryResult } from "../inventory/inventory-reader";
import type { PackageReading } from "../lockfile/lockfile";
import type { ToolPresencePort } from "../tools/tool-presence-port";
import type { SelectionResult, SelectionWriter } from "./apply-selection";
import type { SupportedTool } from "./deploy-tools";
import { parseGitOrigin } from "./git-origin";
import { GLOBAL_LOCK_KEY, type InFlightLocks } from "./in-flight-locks";
import {
  type CopyFinding,
  type CopyVerdict,
  LocalCopyGuard,
  worstVerdict,
} from "./local-copy-guard";
import { isValidSkillSlug } from "./package-ref";
import { reclaimUntargetedCopies } from "./reclaim-untargeted-copies";

// Only the repo arm carries a client-supplied path; the global location is
// resolved server-side.
export type DeployTarget =
  | { kind: "repo"; repoPath: string }
  | { kind: "global" };

// "auth-required" is apm's two fixed phrases only; every other apm or git error
// is "failed".
export type ResolveLatestTagResult =
  | { ok: true; tag: string }
  | { ok: false; reason: "no-tag" | "auth-required" | "failed" };

// "failed" stays unclassified: a refusal apm did not name is never dressed up
// as a diagnosed one (#180).
export type DeploySkillDriverResult =
  | { ok: true }
  | { ok: false; reason: "destination-symlinked" | "failed" };

// No failure reason: every uninstall outcome exits 0 and the only signal is the
// positive marker.
export type RemoveSkillDriverResult = { ok: true } | { ok: false };

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
  // Best-effort fast-forward of the clone before the checks below; never
  // throws (#666).
  syncBeforeDeploy(): Promise<void>;
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
  // `tools` scopes the scan and its baseline, so an untargeted tool's absent
  // copy cannot force a false `diverged` (#136).
  classify(input: {
    target: DeployTarget;
    name: string;
    tools?: readonly SupportedTool[];
    // A copy equal to this release in full is `clean`; an unreadable release
    // grants no such pass (#952).
    release?: string;
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
    target: DeployTarget;
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
  | "deploy-failed";

export type DeploySkillResult =
  | { ok: true; deployed: { type: "skill"; name: string; version: string } }
  // `copyReceipt` licenses exactly the copies just read (#952).
  | {
      ok: false;
      error: DeploySkillError;
      linkedPath?: string;
      copyReceipt?: string;
    };

export type BatchDeployResult = { name: string; result: DeploySkillResult };

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
    // Inject the shared guard so a receipt one flow minted is the proof
    // another checks (#952).
    copyGuard?: Pick<LocalCopyGuard, "check" | "admits">;
    deployedContent: DeployedContentPort;
    recordedPackage: RecordedPackagePort;
    // Global path only.
    deployedCleanup: DeployedCleanupPort;
    // Global path only.
    toolPresence: ToolPresencePort;
    inventoryOriginUrl: () => Promise<string | null>;
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
    return answer?.result ?? { ok: false, error: "deploy-failed" };
  }

  // No consent: a bulk deploy never overwrites a copy with local edits (#292).
  async executeBatch(input: {
    names: readonly string[];
    target: DeployTarget;
  }): Promise<BatchDeployResult[]> {
    return await this.run(input.names, input.target, undefined);
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
      result: results.get(name) ?? { ok: false, error: "deploy-failed" },
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
        return every("deploy-failed");
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
      if (!inventory.primitives.some((p) => p.name === name)) {
        results.set(name, { ok: false, error: "unknown-skill" });
      }
    }
    const known = names.filter((name) => !results.has(name));
    if (known.length === 0) {
      return results;
    }

    const originUrl = await this.deps.inventoryOriginUrl();
    const origin = originUrl === null ? null : parseGitOrigin(originUrl);
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
                : "deploy-failed",
          );
        }
        tag = tagResult.tag;
      }
      await this.deps.inventoryGit.syncBeforeDeploy();

      const candidates: string[] = [];
      for (const name of known) {
        const refusal = await this.nameRefusal(
          name,
          target,
          tag,
          current.kind === "root",
          globalTools,
        );
        if (refusal === null) {
          candidates.push(name);
        } else {
          results.set(name, refusal);
        }
      }
      if (candidates.length === 0) {
        return results;
      }

      // One install rewrites every copy in the Selection, and a same-ref apm
      // install resets an edited copy silently (#56), so the guard reads them
      // all. A copy equal to this release is not an edit (#952).
      const deployed = current.kind === "root" ? current.deployed : [];
      const scope = { write: "deploy", target } as const;
      const check = await this.copyGuard.check({
        ...scope,
        names: union(deployed, candidates),
        ...toolScope,
        release: tag,
      });
      const admitted = this.copyGuard.admits(scope, check, receipt);
      const held = admitted.ok
        ? []
        : await this.heldByCopies(target, candidates, deployed, check.findings);
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
          // Only after a proven install, and for every selected skill: one
          // install rewrites the whole Selection (#136).
          for (const name of desired) {
            await reclaimUntargetedCopies({
              cleanup: this.deps.deployedCleanup,
              target,
              name,
              detected: globalTools,
            });
          }
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
        const blocked = decision.ok
          ? worstVerdict(check.findings.filter((f) => f.name === name))
          : decision.blocked;
        results.set(name, {
          ok: false,
          error: COPY_ERRORS[blocked ?? "unreadable"],
          ...(decision.ok || decision.receipt === null
            ? {}
            : { copyReceipt: decision.receipt }),
        });
      }
      return results;
    } catch {
      return refuseRest("deploy-failed");
    }
  }

  // Null lets the name into the install.
  private async nameRefusal(
    name: string,
    target: DeployTarget,
    tag: string,
    followsRelease: boolean,
    tools: readonly SupportedTool[] | undefined,
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
    // A root-package install skips a symlinked destination and still reports
    // success, so the link is refused here.
    const linkedPath = await this.deps.deployedContent.linkedSkillPath({
      target,
      name,
      tools,
    });
    return linkedPath === null
      ? null
      : { ok: false, error: "destination-symlinked", linkedPath };
  }

  // A blocked deployed copy holds every name, since the one install rewrites
  // it; only a copy the Selection does not hold yet can be left out.
  private async heldByCopies(
    target: DeployTarget,
    candidates: readonly string[],
    deployed: readonly string[],
    findings: readonly CopyFinding[],
  ): Promise<string[]> {
    // Files apm placed under a package type it could not manage are apm's own,
    // not local work; refusing over them would strand the target (#358).
    const apmOwns = new Set<string>();
    for (const name of candidates) {
      const standing = await this.deps.recordedPackage.read({ target, name });
      if (standing.kind === "recorded" && standing.reading.kind !== "skill") {
        apmOwns.add(name);
      }
    }
    const blocking = findings.filter(
      (f) =>
        f.verdict !== "clean" &&
        !(f.verdict === "unverified" && apmOwns.has(f.name)),
    );
    if (blocking.some((f) => deployed.includes(f.name))) {
      return [...candidates];
    }
    return candidates.filter((name) => blocking.some((f) => f.name === name));
  }

  private async installRefusal(
    error: SelectionError,
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
            : "deploy-failed",
    };
  }
}

function union(left: readonly string[], right: readonly string[]): string[] {
  return [...new Set([...left, ...right])];
}
