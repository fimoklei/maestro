// The deploy use-case: guard, resolve the latest tag, and hand the tag-pinned
// ref to the ApmDriver under a per-target lock. See ADR-0003, ADR-0006,
// ADR-0011.
import type { OutdatedResult } from "../drift/parse-outdated";
import type { InventoryResult } from "../inventory/inventory-reader";
import type { PackageReading } from "../lockfile/lockfile";
import type { ToolPresencePort } from "../tools/tool-presence-port";
import type { SelectionWriter } from "./apply-selection";
import type { SupportedTool } from "./deploy-tools";
import { parseGitOrigin } from "./git-origin";
import { GLOBAL_LOCK_KEY, type InFlightLocks } from "./in-flight-locks";
import { type CopyVerdict, LocalCopyGuard } from "./local-copy-guard";
import { isValidSkillSlug } from "./package-ref";
import { reclaimUntargetedCopies } from "./reclaim-untargeted-copies";

// Only the repo arm carries a client-supplied path; the global location is
// apm's own, resolved server-side, so no untrusted path crosses (J07).
export type DeployTarget =
  | { kind: "repo"; repoPath: string }
  | { kind: "global" };

// "auth-required" is apm's two fixed phrases only (apm-driver.md § Classifying
// output); every other apm or git error is "failed".
export type ResolveLatestTagResult =
  | { ok: true; tag: string }
  | { ok: false; reason: "no-tag" | "auth-required" | "failed" };

// "failed" stays unclassified — a refusal apm did not name is never dressed up
// as a diagnosed one (#180).
export type DeploySkillDriverResult =
  | { ok: true }
  | { ok: false; reason: "destination-symlinked" | "failed" };

// No failure reason: every uninstall outcome exits 0 and the only signal is the
// positive marker (apm-behavior.md § Remove).
export type RemoveSkillDriverResult = { ok: true } | { ok: false };

export type ApmDriverPort = {
  resolveLatestTag(ownerRepo: string): Promise<ResolveLatestTagResult>;
  // `tools` scopes apm's `-t`. Present on the global path (ADR-0011); absent on
  // the repo path, where the driver targets every DEPLOY_TOOLS tool (#131).
  deploySkill(input: {
    target: DeployTarget;
    ref: string;
    // The whole desired Selection, one `--skill` flag per name. Never a subset:
    // the flag unions with the list apm persisted, so a name left out stays
    // installed (apm-behavior.md § Root package and its Selection, ADR-0031).
    skills?: readonly string[];
    tools?: readonly SupportedTool[];
  }): Promise<DeploySkillDriverResult>;
  // No tools list: uninstall has no -t. `ref` must be the tag-pinned one the
  // install used — a bare name is rejected and still exits 0 (apm-behavior.md
  // § Remove).
  removeSkill(input: {
    target: DeployTarget;
    ref: string;
  }): Promise<RemoveSkillDriverResult>;
  // Version pairs, never raw apm output (ADR-0007). A run apm could not complete
  // against the remote is `{ ok: false, reason: "unverified" }`.
  checkOutdated(target: DeployTarget): Promise<OutdatedResult>;
};

// The git questions apm cannot answer — `apm view` is repo-level, not
// skill-level (apm-driver.md). Answered against the local inventory clone.
export type InventoryGitPort = {
  // Best-effort fast-forward of the clone before either check below reads
  // it; never throws (#666, see InventoryGitAdapter for what "best-effort"
  // covers).
  syncBeforeDeploy(): Promise<void>;
  skillExistsAtTag(tag: string, name: string): Promise<boolean>;
  // Tree-diff, never apm's opaque content_hash (apm-driver.md § Lockfile).
  skillDivergesFromTag(tag: string, name: string): Promise<boolean>;
  // The skill's files at one release: sha256 per path, relative to the skill
  // directory, so a deployed copy can be compared with it file for file. Null
  // where the clone, the tag or a blob could not be read — the guard then keeps
  // the copy protected (#952).
  readSkillFilesAtTag(
    tag: string,
    name: string,
  ): Promise<Record<string, string> | null>;
};

// The deployed copy vs the lockfile's deployed_file_hashes (#56). The three
// unhappy states stay apart from "not-deployed" so a guard refuses instead of
// reading an unchecked copy as an empty one (#58, #59).
export type DeployedContentState =
  | "not-deployed"
  | "clean"
  | "diverged"
  | "unverifiable"
  | "unreadable"
  | "lockfile-malformed";

export type DeployedContentPort = {
  // `tools` scopes both the scan and the baseline it compares against, so an
  // untargeted tool's absent copy cannot force a false `diverged` (#136).
  classify(input: {
    target: DeployTarget;
    name: string;
    tools?: readonly SupportedTool[];
    // The release the write would install. A copy that differs from its
    // recorded baseline but equals this release in full is `clean`; a release
    // that cannot be read grants no such pass, so the copy stays `diverged`
    // (fail closed, #952).
    release?: string;
  }): Promise<DeployedContentState>;
  // A digest of the copy's bytes as they are right now. Consent is given for
  // content, not for a verdict: two different edits both read `diverged`.
  // Null where nothing could be read (ADR-0031, spec story 41).
  contentDigest(input: {
    target: DeployTarget;
    name: string;
    tools?: readonly SupportedTool[];
  }): Promise<string | null>;
  // The leaf skill directory apm refuses to write into, when one of this
  // deploy's destinations is a symlink; null when none is. Recomputed from the
  // same subtrees rather than read out of apm's prose (ADR-0018, #748).
  linkedSkillPath(input: {
    target: DeployTarget;
    name: string;
    tools?: readonly SupportedTool[];
  }): Promise<string | null>;
};

// What apm recorded for the package this deploy just installed. Anything short
// of an entry we read is "unverified", never a stand-in for success: apm's own
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

// A subtree-scoped filesystem removal, never `apm uninstall -g`, which deletes
// beyond its lockfile (apm-driver.md § Danger). Idempotent — a missing copy is
// a no-op. See ADR-0013, #136.
export type DeployedCleanupPort = {
  removeSkillTargets(input: {
    target: DeployTarget;
    name: string;
    tools: readonly SupportedTool[];
  }): Promise<void>;
};

type DeploySkillInput = {
  // Plain string, not a literal union: the skill-only rule is enforced here so
  // the user gets a business-rule message rather than a schema rejection.
  type: string;
  name: string;
  target: DeployTarget;
  // The receipt this deploy's own refusal minted, licensing the overwrite of
  // the copies it named. Content that changed since retires it, so a stale one
  // consents to nothing (ADR-0006, #952).
  confirmedCopyReceipt?: string;
};

// Each member's meaning for the user is the server's `deployErrorResponses`
// table. "deploy-failed" is the catch-all; every other member is a refusal
// something observed.
export type DeploySkillError =
  | "unsupported-primitive-type"
  | "invalid-name"
  | "unknown-skill"
  | "inventory-not-configured"
  // The harness is connected; its latest release could not be read (#841).
  | "inventory-unreadable"
  | "repo-not-registered"
  | "inventory-origin-unavailable"
  | "no-published-tag"
  // The skill is released, but not at the release this target follows. Moving
  // the whole target there is Update target's job, never this deploy's
  // (ADR-0031).
  | "not-at-target-release"
  // The target still holds per-skill dependencies, which a root package must
  // never sit beside (ADR-0031, #950).
  | "target-pinned-per-skill"
  // The consumer's apm.yml holds a Harness dependency Maestro will not edit, so
  // nothing was written (ADR-0031).
  | "manifest-not-recognised"
  // Two Harness root packages, or one pinned at something that is not a
  // release: the target names no single package to install over.
  | "ref-unresolvable"
  // A Deploy or Remove on this target never finished; it is retried before
  // anything else runs (#951).
  | "operation-unfinished"
  // apm ran and what is on disk is not the Selection that was asked for. The
  // operation record survives, so Retry deploy converges on it (#951).
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

type DeploySkillResult =
  | { ok: true; deployed: { type: "skill"; name: string; version: string } }
  // `packageType` is one of our own readings of apm's recorded type, and
  // `linkedPath` a path Maestro built itself — never apm prose (ADR-0018).
  // `copyReceipt` is present only where consent can clear the refusal: it
  // licenses exactly the copies the guard just read (#952).
  | {
      ok: false;
      error: DeploySkillError;
      packageType?: string;
      linkedPath?: string;
      copyReceipt?: string;
    };

// One mapping from the guard's verdict to the refusal the server's table
// already carries, so the guard adds no second vocabulary (#952).
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
    // The one guard every write entry point classifies and consents through
    // (#952). Injected so a receipt one flow minted is the same proof another
    // checks; left out, this deploy guards through its own classifier alone.
    copyGuard?: Pick<LocalCopyGuard, "check" | "admits">;
    deployedContent: DeployedContentPort;
    recordedPackage: RecordedPackagePort;
    // Global path only (ADR-0011, #136).
    deployedCleanup: DeployedCleanupPort;
    // Global path only (ADR-0011); a repo deploy never consults it.
    toolPresence: ToolPresencePort;
    inventoryOriginUrl: () => Promise<string | null>;
    // realpath, so the lock cannot be sidestepped by a symlinked spelling.
    canonicalPath: (path: string) => Promise<string>;
    // Shared with the remove use-case: both rewrite the same apm.lock.yaml.
    locks: InFlightLocks;
    // The shared Selection write: manifest, install and the proof it landed
    // (#951). Both this deploy and the remove use-case go through it.
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
    if (!isValidSkillSlug(input.name)) {
      return { ok: false, error: "invalid-name" };
    }

    let lockKey: string;
    if (input.target.kind === "repo") {
      const repoPath = input.target.repoPath;
      // The registry gate runs before any filesystem or apm access, so an
      // unregistered path can neither probe inventory state nor reach apm
      // (security.md).
      if (!(await this.deps.registry.isRegistered(repoPath))) {
        return { ok: false, error: "repo-not-registered" };
      }
      // Registration guarantees the path exists, so this is the catch-all for a
      // broken environment.
      try {
        lockKey = await this.deps.canonicalPath(repoPath);
      } catch {
        return { ok: false, error: "deploy-failed" };
      }
    } else {
      lockKey = GLOBAL_LOCK_KEY;
    }

    const run = await this.deps.locks.run(lockKey, () =>
      this.deploy(input, lockKey),
    );
    return run.ok ? run.value : { ok: false, error: "deploy-in-progress" };
  }

  private async deploy(
    input: DeploySkillInput,
    lockKey: string,
  ): Promise<DeploySkillResult> {
    const inventory = await this.deps.inventory.read();
    if (!inventory.ok) {
      return {
        ok: false,
        error:
          inventory.error === "unreadable"
            ? "inventory-unreadable"
            : "inventory-not-configured",
      };
    }
    if (!inventory.primitives.some((p) => p.name === input.name)) {
      return { ok: false, error: "unknown-skill" };
    }

    const originUrl = await this.deps.inventoryOriginUrl();
    const origin = originUrl === null ? null : parseGitOrigin(originUrl);
    if (origin === null) {
      return { ok: false, error: "inventory-origin-unavailable" };
    }

    // Swallow rather than rethrow: a raw apm message may carry a token and must
    // never reach the transport layer (security.md).
    try {
      // Probed before any apm call, so a tool-less machine is refused without
      // running apm for nothing (ADR-0011).
      let globalTools: readonly SupportedTool[] | undefined;
      if (input.target.kind === "global") {
        const detected = await this.deps.toolPresence.detectGlobalTools();
        if (detected.length === 0) {
          return { ok: false, error: "no-supported-tool" };
        }
        globalTools = detected;
      }

      // What the target already follows decides the release: a skill is added
      // at the release the target is on, even a Behind one, so adding one skill
      // never adopts a release the reader did not preview (ADR-0031).
      const current = await this.deps.selection.readTarget(
        input.target,
        origin,
      );
      if (current.kind === "unreadable") {
        return { ok: false, error: current.reason };
      }
      if (current.kind === "pinned-per-skill") {
        return { ok: false, error: "target-pinned-per-skill" };
      }
      // An unfinished operation is converged before anything else runs, so a
      // retry never has to reconcile two intents (#951).
      if ((await this.deps.selection.pending(lockKey)) !== null) {
        return { ok: false, error: "operation-unfinished" };
      }

      let tag: string;
      if (current.kind === "root") {
        tag = current.release;
      } else {
        const tagResult = await this.deps.apm.resolveLatestTag(
          origin.ownerRepo,
        );
        if (!tagResult.ok) {
          if (tagResult.reason === "auth-required") {
            return { ok: false, error: "auth-required" };
          }
          if (tagResult.reason === "no-tag") {
            return { ok: false, error: "no-published-tag" };
          }
          return { ok: false, error: "deploy-failed" };
        }
        tag = tagResult.tag;
      }
      await this.deps.inventoryGit.syncBeforeDeploy();
      if (!(await this.deps.inventoryGit.skillExistsAtTag(tag, input.name))) {
        // Absent at the target's own release is a different refusal from absent
        // everywhere: the way out is Update target, not a Harness release.
        return {
          ok: false,
          error:
            current.kind === "root"
              ? "not-at-target-release"
              : "no-published-tag",
        };
      }
      if (await this.deps.inventoryGit.skillDivergesFromTag(tag, input.name)) {
        return { ok: false, error: "local-diverged-from-tag" };
      }
      // One install rewrites every copy in the Selection, so every one of them
      // is what the guard reads and what consent covers (ADR-0031, #952).
      const deployed = current.kind === "root" ? current.deployed : [];
      const desired = [...new Set([...deployed, input.name])];
      // A clean source can still overwrite a locally-edited deployed copy: a
      // same-ref apm install resets it to the tag silently (#56). The tag goes
      // in, so a copy already equal to this release is not read as an edit
      // (#952).
      const scope = { write: "deploy", target: input.target } as const;
      const check = await this.copyGuard.check({
        ...scope,
        names: desired,
        ...(globalTools === undefined ? {} : { tools: globalTools }),
        release: tag,
      });
      // Files apm placed under a package type it could not manage are apm's
      // own, not local work: refusing the corrected release over them would
      // strand the target on the broken one (#358).
      const standing = await this.deps.recordedPackage.read({
        target: input.target,
        name: input.name,
      });
      const apmOwnsCopy =
        standing.kind === "recorded" && standing.reading.kind !== "skill";
      const admitted = this.copyGuard.admits(
        scope,
        check,
        input.confirmedCopyReceipt,
      );
      // No consent clears "unreadable" or "lockfile-malformed": with no
      // baseline the overwrite would be blind, not informed (ADR-0006).
      if (!admitted.ok && !(admitted.blocked === "unverified" && apmOwnsCopy)) {
        return {
          ok: false,
          error: COPY_ERRORS[admitted.blocked],
          ...(admitted.receipt === null
            ? {}
            : { copyReceipt: admitted.receipt }),
        };
      }

      // One Harness dependency at one release, carrying the exact Selection:
      // the manifest write, the install and the proof it landed all belong to
      // the shared writer (ADR-0031, #951).
      const applied = await this.deps.selection.apply({
        target: input.target,
        key: lockKey,
        kind: "deploy",
        origin,
        release: tag,
        previous: deployed,
        desired,
        ...(globalTools === undefined ? {} : { tools: globalTools }),
      });
      if (!applied.ok) {
        if (applied.error === "destination-symlinked") {
          // The exact link, so the notice can spell out one `rm`; omitted
          // rather than guessed when nothing on disk is one (#748).
          const linkedPath = await this.deps.deployedContent.linkedSkillPath({
            target: input.target,
            name: input.name,
            tools: globalTools,
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
            applied.error === "manifest-not-recognised"
              ? "manifest-not-recognised"
              : applied.error === "apply-incomplete"
                ? "deploy-incomplete"
                : "deploy-failed",
        };
      }

      // After a proven install, never before, so a failed install never
      // reconciles (ADR-0011, #136). Every selected skill: one install
      // rewrites the whole Selection.
      for (const name of desired) {
        await reclaimUntargetedCopies({
          cleanup: this.deps.deployedCleanup,
          target: input.target,
          name,
          detected: globalTools,
        });
      }

      return {
        ok: true,
        deployed: { type: "skill", name: input.name, version: tag },
      };
    } catch {
      return { ok: false, error: "deploy-failed" };
    }
  }
}
