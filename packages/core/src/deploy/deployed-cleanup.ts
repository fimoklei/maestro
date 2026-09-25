// A subtree-scoped `rm`, never `apm uninstall -g`: that wiped 19 real skill
// dirs beyond its lockfile.
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { DeployedCleanupPort, DeployTarget } from "./deploy-skill";
import { deployTargetSubtrees, type SupportedTool } from "./deploy-tools";
import type { DeployedLocation } from "./deployed-location";

export class DeployedCleanupAdapter implements DeployedCleanupPort {
  private readonly deps: {
    location: Pick<DeployedLocation, "treeRoot">;
  };

  constructor(deps: DeployedCleanupAdapter["deps"]) {
    this.deps = deps;
  }

  async removeSkillTargets(input: {
    target: DeployTarget;
    name: string;
    tools: readonly SupportedTool[];
  }): Promise<void> {
    const root = this.deps.location.treeRoot(input.target);
    // The exact <prefix>/skills/<name> dir, never a wider path.
    for (const subtree of deployTargetSubtrees(input.name, input.tools)) {
      await rm(join(root, subtree), { recursive: true, force: true });
    }
  }
}
