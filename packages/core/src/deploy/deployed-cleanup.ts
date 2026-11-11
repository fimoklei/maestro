// A subtree-scoped `rm`, never `apm uninstall -g`: that wiped 19 real skill
// dirs beyond its lockfile.
import { rm } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type { DeployedCleanupPort, DeployTarget } from "./deploy-skill";
import { deployTargetSubtrees, type SupportedTool } from "./deploy-tools";
import type { DeployedLocation } from "./deployed-location";

export class DeployedCleanupAdapter implements DeployedCleanupPort {
  private readonly deps: {
    location: Pick<DeployedLocation, "treeRoot" | "toolRoots">;
  };

  constructor(deps: DeployedCleanupAdapter["deps"]) {
    this.deps = deps;
  }

  async removeSkillTargets(input: {
    target: DeployTarget;
    name: string;
    tools: readonly SupportedTool[];
  }): Promise<void> {
    // The name may come from persisted state: one plain segment, or nothing.
    if (
      input.name !== basename(input.name) ||
      ["", ".", ".."].includes(input.name)
    ) {
      throw new Error("skill name is not a single path segment");
    }
    const root = this.deps.location.treeRoot(input.target);
    // The exact <prefix>/skills/<name> dir, never a wider path.
    const roots = this.deps.location.toolRoots(input.target);
    for (const subtree of deployTargetSubtrees(
      input.name,
      roots,
      input.tools,
    )) {
      await rm(resolve(root, subtree), { recursive: true, force: true });
    }
  }
}
