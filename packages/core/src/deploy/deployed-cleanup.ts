// Adapter: reconcile away an obsolete deployed copy on the global path. When a
// global deploy narrows the target set (a machine that once ran `-t claude,codex`
// but now has only Claude), apm leaves the untargeted tool's files under its
// deployed root — the dead .agents/skills/<name> tree ADR-0011 exists to
// eliminate. This removes exactly those subtrees with a direct, subtree-scoped
// `rm`, never `apm uninstall -g`, which deletes beyond its lockfile (a spike
// wiped 19 real skill dirs — apm-driver.md). Like the other core filesystem
// adapters it touches node:fs directly rather than through a port.
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { DeployedCleanupPort, DeployTarget } from "./deploy-skill";
import { deployTargetSubtrees, type SupportedTool } from "./deploy-tools";

export class DeployedCleanupAdapter implements DeployedCleanupPort {
  private readonly deps: {
    // The root the deployed subtrees sit under. Per-repo: the repo. Global: the
    // home dir, since apm materializes under ~/.claude/skills, ~/.agents/skills
    // (apm-driver.md). Shared with DeployedContentAdapter so cleanup and the
    // guard that feeds it always agree on which tree they mean.
    resolveDeployedRoot: (target: DeployTarget) => string;
  };

  constructor(deps: DeployedCleanupAdapter["deps"]) {
    this.deps = deps;
  }

  async removeSkillTargets(input: {
    target: DeployTarget;
    name: string;
    tools: readonly SupportedTool[];
  }): Promise<void> {
    const root = this.deps.resolveDeployedRoot(input.target);
    // One subtree per obsolete tool — the exact <prefix>/skills/<name> dir, never
    // a wider path. `force` makes an already-gone copy a no-op rather than an
    // error (a narrowed redeploy runs this every time); `recursive` clears the
    // skill's file tree.
    for (const subtree of deployTargetSubtrees(input.name, input.tools)) {
      await rm(join(root, subtree), { recursive: true, force: true });
    }
  }
}
