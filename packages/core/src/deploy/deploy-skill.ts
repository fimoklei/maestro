// The deploy use-case: take "deploy skill X into repo Y" from the screen and
// orchestrate it — validate the name, check the skill exists centrally and the
// repo is registered, resolve the latest published tag, build the tag-pinned
// reference (ADR-0003), and hand it to the ApmDriver. Business rules live
// here; the server route only carries it over HTTP.
import type { InventoryResult } from "../inventory/inventory-reader";
import { parseGitOrigin } from "./git-origin";
import { buildSkillPackageRef, isValidSkillSlug } from "./package-ref";

// The port the real apm CLI adapter implements. resolveLatestTag wraps
// `apm view <owner>/<repo> versions`; deploySkill wraps `apm install <ref>`.
export type ApmDriverPort = {
  resolveLatestTag(ownerRepo: string): Promise<string | null>;
  deploySkill(input: { repoPath: string; ref: string }): Promise<void>;
};

export type DeploySkillInput = {
  type: "skill";
  name: string;
  repoPath: string;
};

export type DeploySkillError =
  | "invalid-name"
  | "unknown-skill"
  | "inventory-not-configured"
  | "repo-not-registered"
  | "inventory-origin-unavailable"
  | "no-deployable-tag"
  // A single catch-all for any apm execution failure (CLI missing, no
  // auth/network, skill absent at the tag). This slice keeps the happy path;
  // the follow-up (issue #15) differentiates the causes into actionable errors.
  | "deploy-failed";

export type DeploySkillResult =
  | { ok: true; deployed: { type: "skill"; name: string; version: string } }
  | { ok: false; error: DeploySkillError };

export class DeploySkill {
  private readonly deps: {
    inventory: { read(): Promise<InventoryResult> };
    registry: { isRegistered(path: string): Promise<boolean> };
    apm: ApmDriverPort;
    inventoryOriginUrl: () => Promise<string | null>;
  };

  constructor(deps: DeploySkill["deps"]) {
    this.deps = deps;
  }

  async execute(input: DeploySkillInput): Promise<DeploySkillResult> {
    if (!isValidSkillSlug(input.name)) {
      return { ok: false, error: "invalid-name" };
    }

    const inventory = await this.deps.inventory.read();
    if (!inventory.ok) {
      return { ok: false, error: "inventory-not-configured" };
    }
    if (!inventory.primitives.some((p) => p.name === input.name)) {
      return { ok: false, error: "unknown-skill" };
    }

    if (!(await this.deps.registry.isRegistered(input.repoPath))) {
      return { ok: false, error: "repo-not-registered" };
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
        return { ok: false, error: "no-deployable-tag" };
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
