// The deploy use-case: take "deploy skill X into repo Y" from the screen and
// orchestrate it — validate the request, check the skill exists centrally and
// the repo is registered, resolve the latest published tag, refuse if the
// local skill diverges from it, and hand the tag-pinned reference (ADR-0003)
// to the ApmDriver under a per-repo lock. Business rules live here; the
// server route only carries it over HTTP.
import type { InventoryResult } from "../inventory/inventory-reader";
import { parseGitOrigin } from "./git-origin";
import { buildSkillPackageRef, isValidSkillSlug } from "./package-ref";

// The port the real apm CLI adapter implements. resolveLatestTag wraps
// `apm view <owner>/<repo> versions`; deploySkill wraps `apm install <ref>`.
export type ApmDriverPort = {
  resolveLatestTag(ownerRepo: string): Promise<string | null>;
  deploySkill(input: { repoPath: string; ref: string }): Promise<void>;
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

export type DeploySkillInput = {
  // Accepted as a plain string at the edge; the skill-only rule is a business
  // rule here, not a schema shape, so the user gets an honest message.
  type: string;
  name: string;
  repoPath: string;
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
    apm: ApmDriverPort;
    inventoryGit: InventoryGitPort;
    inventoryOriginUrl: () => Promise<string | null>;
    // Resolves a path to its canonical form (realpath), so the in-flight
    // lock cannot be sidestepped by a symlinked spelling of the same repo.
    canonicalPath: (path: string) => Promise<string>;
  };

  // In-process deploy lock: canonical repo paths with a deploy in flight.
  // Per-instance is enough — the server composes one DeploySkill.
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

    // Registry gate first: a path-taking endpoint must reject an unregistered
    // repo before any filesystem or apm access, so an unregistered path can
    // neither probe inventory state nor reach apm (security.md).
    if (!(await this.deps.registry.isRegistered(input.repoPath))) {
      return { ok: false, error: "repo-not-registered" };
    }

    // Registration guarantees the path exists, so canonicalizing only fails
    // on a genuinely broken environment — owned as the catch-all error.
    let canonical: string;
    try {
      canonical = await this.deps.canonicalPath(input.repoPath);
    } catch {
      return { ok: false, error: "deploy-failed" };
    }
    if (this.inFlight.has(canonical)) {
      return { ok: false, error: "deploy-in-progress" };
    }
    this.inFlight.add(canonical);
    try {
      return await this.deploy(input);
    } finally {
      this.inFlight.delete(canonical);
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

      const ref = buildSkillPackageRef({
        host: origin.host,
        ownerRepo: origin.ownerRepo,
        name: input.name,
        tag,
      });
      await this.deps.apm.deploySkill({ repoPath: input.repoPath, ref });

      return {
        ok: true,
        deployed: { type: "skill", name: input.name, version: tag },
      };
    } catch {
      return { ok: false, error: "deploy-failed" };
    }
  }
}
