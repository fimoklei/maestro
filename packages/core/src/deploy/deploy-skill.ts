// The deploy use-case: take "deploy skill X into repo Y" from the screen and
// orchestrate it — validate the request, check the skill exists centrally and
// the repo is registered, resolve the latest published tag, refuse if the
// local skill diverges from it, and hand the tag-pinned reference (ADR-0003)
// to the ApmDriver under a per-repo lock. Business rules live here; the
// server route only carries it over HTTP.
import type { InventoryResult } from "../inventory/inventory-reader";
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

// The port the real apm CLI adapter implements. resolveLatestTag wraps
// `apm view <owner>/<repo> versions`; deploySkill wraps `apm install <ref>`
// (a repo install runs in that repo; a global install runs `-g`).
export type ApmDriverPort = {
  resolveLatestTag(ownerRepo: string): Promise<string | null>;
  deploySkill(input: { target: DeployTarget; ref: string }): Promise<void>;
  // Wraps `apm outdated` for a target and returns the skills behind the latest
  // central tag. A failed run (CLI missing, no auth/network, non-zero exit) is
  // a flat `{ ok: false }` — never raw apm output, never a taxonomy.
  checkOutdated(
    target: DeployTarget,
  ): Promise<{ ok: true; behind: string[] } | { ok: false }>;
};

// Git questions apm cannot answer (apm view is repo-level): whether a tag's
// tree contains skills/<name>. Implemented against the local inventory clone.
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
export type DeployedContentState =
  | "not-deployed"
  | "clean"
  | "diverged"
  | "unverifiable";

export type DeployedContentPort = {
  classify(input: {
    target: DeployTarget;
    name: string;
  }): Promise<DeployedContentState>;
};

export type DeploySkillInput = {
  // Accepted as a plain string at the edge; the skill-only rule is a business
  // rule here, not a schema shape, so the user gets an honest message.
  type: string;
  name: string;
  target: DeployTarget;
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
  // A deploy to the same repo is already running (double-click, second tab,
  // retry) — racing it would corrupt the same apm.lock.yaml.
  | "deploy-in-progress"
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
      const tag = await this.deps.apm.resolveLatestTag(origin.ownerRepo);
      if (tag === null) {
        return { ok: false, error: "no-published-tag" };
      }
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
      });
      if (deployedState === "diverged") {
        return { ok: false, error: "deployed-diverged-from-lock" };
      }
      if (deployedState === "unverifiable") {
        return { ok: false, error: "deployed-unverifiable" };
      }

      const ref = buildSkillPackageRef({
        host: origin.host,
        ownerRepo: origin.ownerRepo,
        name: input.name,
        tag,
      });
      await this.deps.apm.deploySkill({ target: input.target, ref });

      return {
        ok: true,
        deployed: { type: "skill", name: input.name, version: tag },
      };
    } catch {
      return { ok: false, error: "deploy-failed" };
    }
  }
}
