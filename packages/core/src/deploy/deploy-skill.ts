// The deploy use-case: take "deploy skill X into repo Y" from the screen and
// orchestrate it — validate the request, check the skill exists centrally and
// the repo is registered, resolve the latest published tag, refuse if the
// local skill diverges from it, and hand the tag-pinned reference (ADR-0003)
// to the ApmDriver under a per-repo lock. Business rules live here; the
// server route only carries it over HTTP.
import type { OutdatedResult } from "../drift/parse-outdated";
import type { InventoryResult } from "../inventory/inventory-reader";
import type { ToolPresencePort } from "../tools/tool-presence-port";
import { type SupportedTool, untargetedTools } from "./deploy-tools";
import { parseGitOrigin } from "./git-origin";
import { buildSkillPackageRef, isValidSkillSlug } from "./package-ref";

// The in-flight lock key for the single user (global) scope. A canonical repo
// path is always absolute, so it can never collide with this literal.
const GLOBAL_LOCK_KEY = "global";

// Where a skill is deployed to. A repo carries a client-supplied path (gated by
// the registry); global carries none — the user-scope location is apm's own,
// resolved server-side, so no untrusted path crosses the boundary (J07).
export type DeployTarget =
  | { kind: "repo"; repoPath: string }
  | { kind: "global" };

// Outcome of resolving the latest tag. A discriminated result, not
// `string | null`, so the auth case is carried explicitly instead of thrown —
// mirroring checkOutdated's result-with-reason shape (no control-flow-by-
// exception). "no-tag": apm answered but published no deployable vX.Y.Z tag.
// "auth-required": apm said GitHub auth is missing/expired (its two fixed
// phrases, listed in apm-driver.md). "failed": any other apm/git error
// (network, host down, CLI missing).
export type ResolveLatestTagResult =
  | { ok: true; tag: string }
  | { ok: false; reason: "no-tag" | "auth-required" | "failed" };

// The port the real apm CLI adapter implements. resolveLatestTag wraps
// `apm view <owner>/<repo> versions`; deploySkill wraps `apm install <ref>`
// (a repo install runs in that repo; a global install runs `-g`).
export type ApmDriverPort = {
  resolveLatestTag(ownerRepo: string): Promise<ResolveLatestTagResult>;
  // `tools` scopes the apm `-t` flag to exactly those tokens. Present on the
  // global path (the tools detected on the machine, ADR-0011); absent on the
  // repo path, where the driver keeps targeting every DEPLOY_TOOLS tool (#131).
  deploySkill(input: {
    target: DeployTarget;
    ref: string;
    tools?: readonly SupportedTool[];
  }): Promise<void>;
  // Wraps `apm outdated` for a target and returns the skills behind the latest
  // central tag, each as a deployed -> latest version pair (ADR-0007). A run apm
  // could not complete against the remote (no auth/network) is
  // `{ ok: false, reason: "unverified" }`; a genuine failure (CLI missing,
  // non-zero exit, unrecognised output) is a bare `{ ok: false }`. Never raw apm
  // output.
  checkOutdated(target: DeployTarget): Promise<OutdatedResult>;
};

// Git questions apm cannot answer (apm view is repo-level): whether a tag's
// tree contains skills/<name> (apm-driver.md). Implemented against the local
// inventory clone.
export type InventoryGitPort = {
  skillExistsAtTag(tag: string, name: string): Promise<boolean>;
  // Whether the local skills/<name> working tree differs from the tag's
  // subtree (edited or untracked files). Never derived from apm's opaque
  // content_hash — tree-diff is the recorded decision (apm-driver.md).
  skillDivergesFromTag(tag: string, name: string): Promise<boolean>;
};

// State of the *deployed* copy (the destination) vs what apm last recorded for
// it in the target lockfile's deployed_file_hashes. "not-deployed" means no
// lockfile entry yet (a first deploy — nothing to overwrite). Detects the
// silent-overwrite risk the source-side InventoryGitPort cannot see (#56).
// "unverifiable" — a deployed entry exists but carries no recorded hashes (a
// pre-0.20.0 lockfile), so drift cannot be checked. Distinct from
// "not-deployed" (no entry at all) so the guard refuses instead of proceeding.
// "unreadable" — a deploy subtree exists but cannot be read (permission denied,
// I/O error, a file where a directory was expected). Distinct from a genuinely
// missing subtree, which reads as empty: refuse rather than swallow the error to
// "not-deployed" and let a deploy silently overwrite what we could not read (#59).
// "lockfile-malformed" — the target's apm.lock.yaml is present but does not parse
// (bad YAML or wrong shape). A malformed lockfile is a visible error, never the
// empty-disk "not-deployed" stand-in that would let a deploy proceed (#58).
export type DeployedContentState =
  | "not-deployed"
  | "clean"
  | "diverged"
  | "unverifiable"
  | "unreadable"
  | "lockfile-malformed";

export type DeployedContentPort = {
  // `tools` scopes the scan (and the recorded baseline it is compared against) to
  // exactly those tools' deployed copies. Present on the global path (the detected
  // tools) so an untargeted tool's absent copy — left in the lockfile by a prior
  // two-tool install — cannot force a false `diverged` (ADR-0011, #136). Absent on
  // the repo path and the #111 read-path, which scan every DEPLOY_TOOLS copy.
  classify(input: {
    target: DeployTarget;
    name: string;
    tools?: readonly SupportedTool[];
  }): Promise<DeployedContentState>;
};

// Removes the deployed copies of `tools` for a skill under the target's deployed
// root. Used on the global path to reconcile away an untargeted tool's copy that
// apm leaves behind when a deploy narrows the target set (ADR-0011, #136). A
// direct, subtree-scoped filesystem removal — never `apm uninstall -g`, which
// deletes beyond its lockfile (apm-driver.md). Idempotent: a missing copy is a
// no-op, not an error.
export type DeployedCleanupPort = {
  removeSkillTargets(input: {
    target: DeployTarget;
    name: string;
    tools: readonly SupportedTool[];
  }): Promise<void>;
};

export type DeploySkillInput = {
  // Accepted as a plain string at the edge; the skill-only rule is a business
  // rule here, not a schema shape, so the user gets an honest message.
  type: string;
  name: string;
  target: DeployTarget;
  // Confirmed reinstall: skip the destination guard for a not-proven-clean copy
  // (diverged or unverifiable) and reinstall at the latest tag, discarding any
  // local edits. A deliberate cockpit-confirmed override of a safety guard,
  // never a default — every other guard still runs (ADR-0006, #66).
  force?: boolean;
};

export type DeploySkillError =
  | "unsupported-primitive-type"
  | "invalid-name"
  | "unknown-skill"
  | "inventory-not-configured"
  | "repo-not-registered"
  | "inventory-origin-unavailable"
  // No tag exists at all, or the latest tag's tree does not contain the
  // skill. Either way the cure is the same: tag and push central first.
  | "no-published-tag"
  // The local skill tree differs from the latest tag: deploying would ship
  // stale content. The cure is to tag & push the local change.
  | "local-diverged-from-tag"
  // The deployed copy (destination) has local edits or untracked files vs the
  // lockfile: a same-ref apm install would silently reset them. Refuse so the
  // user reconciles those edits first (refuse-only, #56).
  | "deployed-diverged-from-lock"
  // The deployed copy exists but carries no recorded hashes (a pre-0.20.0
  // lockfile), so drift cannot be verified. Refuse rather than risk a silent
  // reset; the user reconciles (e.g. removes the deployed copy) first (#56).
  | "deployed-unverifiable"
  // The deployed copy exists but cannot be read (permission denied, I/O error,
  // a file where a directory was expected). We cannot prove it safe to
  // overwrite, so refuse instead of swallowing the error to a blind deploy (#59).
  | "deployed-unreadable"
  // The target's apm.lock.yaml is present but does not parse (bad YAML or wrong
  // shape), so there is no trustworthy baseline. Refuse rather than treat a
  // malformed lockfile as "nothing deployed" and proceed blindly (#58).
  | "lockfile-malformed"
  // A deploy to the same repo is already running (double-click, second tab,
  // retry) — racing it would corrupt the same apm.lock.yaml.
  | "deploy-in-progress"
  // A global deploy was requested but no supported AI coding tool (Claude Code
  // or Codex) is installed on the machine, so there is nothing to deploy to.
  // Refuse before apm runs rather than write a dead tree (global path only,
  // ADR-0011, #131).
  | "no-supported-tool"
  // apm could not authenticate to GitHub (missing or expired token), detected
  // at resolveLatestTag via apm's fixed auth phrases. Distinct from the generic
  // deploy-failed so the cockpit points at auth, not a vague apm error (#119).
  | "auth-required"
  // Catch-all for apm/git execution failures (CLI missing, no auth/network).
  | "deploy-failed";

export type DeploySkillResult =
  | { ok: true; deployed: { type: "skill"; name: string; version: string } }
  | { ok: false; error: DeploySkillError };

export class DeploySkill {
  private readonly deps: {
    inventory: { read(): Promise<InventoryResult> };
    registry: { isRegistered(path: string): Promise<boolean> };
    // Depends only on the port methods it uses, so growing ApmDriverPort (e.g.
    // checkOutdated for drift) never breaks this use-case or its fakes.
    apm: Pick<ApmDriverPort, "resolveLatestTag" | "deploySkill">;
    inventoryGit: InventoryGitPort;
    deployedContent: DeployedContentPort;
    // Removes an untargeted tool's leftover deployed copy after a narrowed
    // global deploy (ADR-0011, #136). Global path only.
    deployedCleanup: DeployedCleanupPort;
    // Answers which supported tools the machine has, for the global path only
    // (ADR-0011). A repo deploy never consults it.
    toolPresence: ToolPresencePort;
    inventoryOriginUrl: () => Promise<string | null>;
    // Resolves a path to its canonical form (realpath), so the in-flight
    // lock cannot be sidestepped by a symlinked spelling of the same repo.
    canonicalPath: (path: string) => Promise<string>;
  };

  // In-process deploy lock: lock keys with a deploy in flight — a canonical
  // repo path, or the literal "global" for the user scope. Per-instance is
  // enough — the server composes one DeploySkill.
  private readonly inFlight = new Set<string>();

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

    // Resolve the lock key per target. A repo install is gated and
    // canonicalized; a global install crosses no untrusted path, so it skips
    // the registry and locks on a fixed key (security.md, J07).
    let lockKey: string;
    if (input.target.kind === "repo") {
      const repoPath = input.target.repoPath;
      // Registry gate first: a path-taking endpoint must reject an
      // unregistered repo before any filesystem or apm access, so an
      // unregistered path can neither probe inventory state nor reach apm.
      if (!(await this.deps.registry.isRegistered(repoPath))) {
        return { ok: false, error: "repo-not-registered" };
      }
      // Registration guarantees the path exists, so canonicalizing only fails
      // on a genuinely broken environment — owned as the catch-all error.
      try {
        lockKey = await this.deps.canonicalPath(repoPath);
      } catch {
        return { ok: false, error: "deploy-failed" };
      }
    } else {
      lockKey = GLOBAL_LOCK_KEY;
    }

    if (this.inFlight.has(lockKey)) {
      return { ok: false, error: "deploy-in-progress" };
    }
    this.inFlight.add(lockKey);
    try {
      return await this.deploy(input);
    } finally {
      this.inFlight.delete(lockKey);
    }
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

    // From here on we drive apm, which can reject. Own that as a typed error
    // so it never escapes as an unhandled rejection (and the raw apm message,
    // which may carry a token, never reaches the transport layer).
    try {
      // Global path only: a global install must target the tools the machine
      // actually has, never the always-both constant (ADR-0011). Detect presence
      // before any apm call so a tool-less machine is refused without running apm
      // for nothing. A repo deploy skips this entirely.
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
        // Map apm's resolve outcome to a domain error. auth-required is surfaced
        // distinct; a resolved-but-untagged repo is "tag central first"; any
        // other resolve failure is the generic apm error (#119).
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
      // Destination guard: a clean source can still overwrite a locally-edited
      // deployed copy, since a same-ref apm install resets it to the tag
      // silently. Refuse on divergence; first deploy ("not-deployed") and a
      // clean copy proceed (#56).
      const deployedState = await this.deps.deployedContent.classify({
        target: input.target,
        name: input.name,
        // Global: scope the guard to the detected tools so an untargeted tool's
        // absent copy (left in the lockfile by a prior two-tool install) cannot
        // force a false refusal. Repo: undefined — scan every tool (#136).
        tools: globalTools,
      });
      // A confirmed reinstall (force) overrides the two not-proven-clean states
      // — diverged and unverifiable — since a deployed copy is non-precious
      // generated content (ADR-0006). It never overrides "unreadable": we cannot
      // read what is there, so a forced overwrite would be blind, not informed.
      if (deployedState === "diverged" && !input.force) {
        return { ok: false, error: "deployed-diverged-from-lock" };
      }
      if (deployedState === "unverifiable" && !input.force) {
        return { ok: false, error: "deployed-unverifiable" };
      }
      if (deployedState === "unreadable") {
        return { ok: false, error: "deployed-unreadable" };
      }
      // Like unreadable, never force-overridable: a malformed lockfile leaves no
      // baseline to verify against, so a forced overwrite would be blind (#58).
      if (deployedState === "lockfile-malformed") {
        return { ok: false, error: "lockfile-malformed" };
      }

      const ref = buildSkillPackageRef({
        host: origin.host,
        ownerRepo: origin.ownerRepo,
        name: input.name,
        tag,
      });
      await this.deps.apm.deploySkill({
        target: input.target,
        ref,
        // Present on the global path (the detected tools); undefined for a repo
        // deploy, where the driver keeps targeting every DEPLOY_TOOLS tool.
        tools: globalTools,
      });

      // Reconcile away any obsolete copy left by a prior wider global install:
      // apm preserves the untargeted tool's files and lockfile hashes, so a
      // Claude-only redeploy would otherwise leave the dead .agents tree ADR-0011
      // exists to eliminate. Global path only, after a proven-successful install
      // (the driver verifies apm's positive marker), so a failed install never
      // reconciles. A missing copy is a no-op (#136).
      if (globalTools !== undefined) {
        const obsolete = untargetedTools(globalTools);
        if (obsolete.length > 0) {
          // Best-effort: the install already succeeded, so a cleanup failure must
          // not invert the result to deploy-failed. It leaves the pre-existing
          // dead tree — no worse than before this deploy — which the next deploy
          // retries idempotently (force-rm). Swallowed here rather than surfaced
          // because DeploySkill has no logging channel; the guard scoping keeps
          // the leftover inert for the reader meanwhile (#136).
          try {
            await this.deps.deployedCleanup.removeSkillTargets({
              target: input.target,
              name: input.name,
              tools: obsolete,
            });
          } catch {
            // Intentionally ignored — see above.
          }
        }
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
