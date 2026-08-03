// The deploy use-case: guard, resolve the latest tag, and hand the tag-pinned
// ref to the ApmDriver under a per-target lock. See ADR-0003, ADR-0006,
// ADR-0011.
import type { OutdatedResult } from "../drift/parse-outdated";
import type { InventoryResult } from "../inventory/inventory-reader";
import { classifyPackageType } from "../lockfile/lockfile";
import type { ToolPresencePort } from "../tools/tool-presence-port";
import type { SupportedTool } from "./deploy-tools";
import { parseGitOrigin } from "./git-origin";
import { GLOBAL_LOCK_KEY, type InFlightLocks } from "./in-flight-locks";
import { buildSkillPackageRef, isValidSkillSlug } from "./package-ref";
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
  skillExistsAtTag(tag: string, name: string): Promise<boolean>;
  // Tree-diff, never apm's opaque content_hash (apm-driver.md § Lockfile).
  skillDivergesFromTag(tag: string, name: string): Promise<boolean>;
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
  }): Promise<DeployedContentState>;
};

// What apm recorded for the package this deploy just installed. `null` covers
// no lockfile, no entry and an unreadable one alike: with nothing recorded the
// install apm proved stands (#358).
export type RecordedPackagePort = {
  read(input: { target: DeployTarget; name: string }): Promise<string | null>;
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
  // Overrides only the two not-proven-clean states; every other guard still
  // runs (ADR-0006, #66).
  force?: boolean;
};

// Each member's meaning for the user is the server's `deployErrorResponses`
// table. "deploy-failed" is the catch-all; every other member is a refusal
// something observed.
export type DeploySkillError =
  | "unsupported-primitive-type"
  | "invalid-name"
  | "unknown-skill"
  | "inventory-not-configured"
  | "repo-not-registered"
  | "inventory-origin-unavailable"
  | "no-published-tag"
  | "local-diverged-from-tag"
  | "deployed-diverged-from-lock"
  | "deployed-unverifiable"
  | "deployed-unreadable"
  | "lockfile-malformed"
  | "deploy-in-progress"
  | "no-supported-tool"
  | "auth-required"
  | "destination-symlinked"
  // apm installed the package but recorded it as something Maestro cannot
  // manage as a skill; the files are on disk and stay there (#358).
  | "deployed-unsupported-package-type"
  // apm's own verdict that the attempt placed nothing, worn under a success
  // marker (#358).
  | "deploy-recorded-invalid"
  | "deploy-failed";

type DeploySkillResult =
  | { ok: true; deployed: { type: "skill"; name: string; version: string } }
  // `packageType` is one of our own readings of apm's recorded type, never apm
  // prose (ADR-0018).
  | { ok: false; error: DeploySkillError; packageType?: string };

export class DeploySkill {
  private readonly deps: {
    inventory: { read(): Promise<InventoryResult> };
    registry: { isRegistered(path: string): Promise<boolean> };
    apm: Pick<ApmDriverPort, "resolveLatestTag" | "deploySkill">;
    inventoryGit: InventoryGitPort;
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
  };

  constructor(deps: DeploySkill["deps"]) {
    this.deps = deps;
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

    const run = await this.deps.locks.run(lockKey, () => this.deploy(input));
    return run.ok ? run.value : { ok: false, error: "deploy-in-progress" };
  }

  private async deploy(input: DeploySkillInput): Promise<DeploySkillResult> {
    const inventory = await this.deps.inventory.read();
    if (!inventory.ok) {
      return { ok: false, error: "inventory-not-configured" };
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

      const tagResult = await this.deps.apm.resolveLatestTag(origin.ownerRepo);
      if (!tagResult.ok) {
        if (tagResult.reason === "auth-required") {
          return { ok: false, error: "auth-required" };
        }
        if (tagResult.reason === "no-tag") {
          return { ok: false, error: "no-published-tag" };
        }
        return { ok: false, error: "deploy-failed" };
      }
      const tag = tagResult.tag;
      if (!(await this.deps.inventoryGit.skillExistsAtTag(tag, input.name))) {
        return { ok: false, error: "no-published-tag" };
      }
      if (await this.deps.inventoryGit.skillDivergesFromTag(tag, input.name)) {
        return { ok: false, error: "local-diverged-from-tag" };
      }
      // A clean source can still overwrite a locally-edited deployed copy: a
      // same-ref apm install resets it to the tag silently (#56).
      const deployedState = await this.deps.deployedContent.classify({
        target: input.target,
        name: input.name,
        tools: globalTools,
      });
      // `force` never overrides "unreadable" or "lockfile-malformed": with no
      // baseline the overwrite would be blind, not informed (ADR-0006).
      if (deployedState === "diverged" && !input.force) {
        return { ok: false, error: "deployed-diverged-from-lock" };
      }
      if (deployedState === "unverifiable" && !input.force) {
        return { ok: false, error: "deployed-unverifiable" };
      }
      if (deployedState === "unreadable") {
        return { ok: false, error: "deployed-unreadable" };
      }
      if (deployedState === "lockfile-malformed") {
        return { ok: false, error: "lockfile-malformed" };
      }

      const ref = buildSkillPackageRef({
        host: origin.host,
        ownerRepo: origin.ownerRepo,
        name: input.name,
        tag,
      });
      const installed = await this.deps.apm.deploySkill({
        target: input.target,
        ref,
        tools: globalTools,
      });
      if (!installed.ok) {
        return {
          ok: false,
          error:
            installed.reason === "destination-symlinked"
              ? "destination-symlinked"
              : "deploy-failed",
        };
      }

      // apm exits 0 and prints its success marker even for a package it
      // recorded as invalid, so the record is the only honest outcome (#358).
      // Read before the reclaim: an unsupported result is reported, not tidied
      // up around.
      const recorded = await this.deps.recordedPackage.read({
        target: input.target,
        name: input.name,
      });
      if (recorded !== null && classifyPackageType(recorded) !== "skill") {
        return recorded === "invalid"
          ? { ok: false, error: "deploy-recorded-invalid" }
          : {
              ok: false,
              error: "deployed-unsupported-package-type",
              packageType: recorded,
            };
      }

      // After a proven install, never before, so a failed install never
      // reconciles (ADR-0011, #136).
      await reclaimUntargetedCopies({
        cleanup: this.deps.deployedCleanup,
        target: input.target,
        name: input.name,
        detected: globalTools,
      });

      return {
        ok: true,
        deployed: { type: "skill", name: input.name, version: tag },
      };
    } catch {
      return { ok: false, error: "deploy-failed" };
    }
  }
}
