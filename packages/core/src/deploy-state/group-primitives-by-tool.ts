// The per-tool grouping of a parsed global (user-scope) lockfile — the heart of
// J03's global read (ADR-0011). apm writes ONE entry per skill even for a
// two-tool install (`-t claude,codex`), with a deployed_files list carrying both
// the `.claude/` and `.agents/` copies (apm-driver.md). To report state per
// detected tool, this attributes each entry to every tool whose skillsDirPrefix
// appears in its deployed_files — and to no other, so a claude-only skill is
// never back-filled under codex (out of scope: Job B). A detected tool with
// nothing deployed is still listed as an empty group, so a newly-installed Codex
// shows up as recognised-but-empty. Pure: the reader does the I/O and hands the
// parsed entries plus the detected-tool set here.
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
  // One group per detected tool, in the port's (DEPLOY_TOOLS) order; an empty
  // group is the honest "detected but nothing deployed" state.
  const tools: ToolDeployState[] = detectedTools.map((tool) => ({
    tool,
    primitives: [],
  }));
  const skipped: SkippedEntry[] = [];

  for (const entry of entries) {
    const name = claudeSkillName(entry);
    if (name === null) {
      // An entry we could parse but whose package_type we don't support yet —
      // surfaced once, never silently dropped (mirrors the per-repo read).
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

// True when any of the entry's deployed_files sits under `<prefix>/` (the copy
// apm materialized for that tool). The trailing slash keeps `.claude` from
// matching a `.claudex`-style sibling; a bare-directory entry (`.claude/skills/x`)
// still matches its own `.claude/` prefix.
function entryTargetsPrefix(entry: LockfileEntry, prefix: string): boolean {
  return (entry.deployed_files ?? []).some((file) =>
    file.startsWith(`${prefix}/`),
  );
}
