// apm writes ONE entry per skill even for a two-tool install, listing both
// copies in deployed_files (apm-behavior.md § Lockfile), so an entry is
// attributed per prefix found there and to no other tool (ADR-0011).
import { DEPLOY_TOOLS, type SupportedTool } from "../deploy/deploy-tools";
import { claudeSkillName, type LockfileEntry } from "../lockfile/lockfile";
import type { DeployedPrimitive, SkippedEntry } from "./deploy-state-types";

export type ToolDeployState = {
  tool: SupportedTool;
  primitives: DeployedPrimitive[];
};

const SKILLS_DIR_PREFIX = new Map<SupportedTool, string>(
  DEPLOY_TOOLS.map((tool) => [tool.apmTarget, tool.skillsDirPrefix]),
);

export function groupPrimitivesByTool(
  entries: LockfileEntry[],
  detectedTools: readonly SupportedTool[],
): { tools: ToolDeployState[]; skipped: SkippedEntry[] } {
  // An empty group is the honest "detected but nothing deployed" state.
  const tools: ToolDeployState[] = detectedTools.map((tool) => ({
    tool,
    primitives: [],
  }));
  const skipped: SkippedEntry[] = [];

  for (const entry of entries) {
    const name = claudeSkillName(entry);
    if (name === null) {
      skipped.push({
        virtualPath: entry.virtual_path,
        packageType: entry.package_type,
      });
      continue;
    }
    for (const group of tools) {
      const prefix = SKILLS_DIR_PREFIX.get(group.tool);
      if (prefix !== undefined && entryTargetsPrefix(entry, prefix)) {
        group.primitives.push({
          type: "skill",
          name,
          version: entry.resolved_ref,
        });
      }
    }
  }
  return { tools, skipped };
}

// The trailing slash keeps `.claude` from matching a `.claudex` sibling.
function entryTargetsPrefix(entry: LockfileEntry, prefix: string): boolean {
  return (entry.deployed_files ?? []).some((file) =>
    file.startsWith(`${prefix}/`),
  );
}
