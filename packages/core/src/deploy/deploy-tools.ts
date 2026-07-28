// Single source of truth for which tools a skill deploy targets: the install
// flag, the scanned subtrees, the presence probe, and directory exclusivity all
// derive from DEPLOY_TOOLS, so one cannot drift from the others (#63, #131).

// apm's own `-t` token (apm-behavior.md § Reference grammar).
export type SupportedTool = "claude" | "codex";

type DeployTool = {
  apmTarget: SupportedTool;
  // codex deploys to the cross-client ".agents" dir, not ".codex".
  skillsDirPrefix: string;
  // Deploy-immune by design: the tool's own config, never a skills directory a
  // deploy creates. Do NOT key on ".claude"/".codex"/".agents" (ADR-0011).
  globalPresenceMarker: string;
  // Whether this tool is the only reader of skillsDirPrefix. Answer it from
  // apm's deploy paths per tool; never default it to true (#202).
  skillsDirIsExclusive: boolean;
};

export const DEPLOY_TOOLS: readonly DeployTool[] = [
  {
    apmTarget: "claude",
    skillsDirPrefix: ".claude",
    globalPresenceMarker: ".claude.json",
    skillsDirIsExclusive: true,
  },
  {
    apmTarget: "codex",
    skillsDirPrefix: ".agents",
    globalPresenceMarker: ".codex/config.toml",
    // Ten apm targets read .agents/skills/, so an absent Codex is one missing
    // reader of ten (apm-behavior.md → ".agents/skills/ has ten readers").
    skillsDirIsExclusive: false,
  },
];

// One comma list, never a repeated flag — apm takes the last `-t` only
// (apm-driver.md § Invocation).
export const APM_DEPLOY_TARGET_FLAG = DEPLOY_TOOLS.map(
  (tool) => tool.apmTarget,
).join(",");

// The `-t` value for a global install (ADR-0011). Filtered against DEPLOY_TOOLS
// so this file keeps owning the token set and its order; unknown tokens drop.
// Empty when nothing is detected — the caller refuses before apm runs.
export function apmTargetFlagForTools(tools: readonly SupportedTool[]): string {
  return DEPLOY_TOOLS.filter((tool) => tools.includes(tool.apmTarget))
    .map((tool) => tool.apmTarget)
    .join(",");
}

// Keyed relative to the deployed root, matching the lockfile's
// deployed_file_hashes. Omitting `tools` means every DEPLOY_TOOLS tool — what
// the repo path and the removal guard both need (ADR-0011, #136).
export function deployTargetSubtrees(
  name: string,
  tools?: readonly SupportedTool[],
): string[] {
  return DEPLOY_TOOLS.filter(
    (tool) => tools === undefined || tools.includes(tool.apmTarget),
  ).map((tool) => `${tool.skillsDirPrefix}/skills/${name}`);
}

// Exclusive directories only: a shared one has readers Maestro never measured,
// and a stale tree costs disk where a wrong removal costs another tool its
// skills (ADR-0011, #202).
export function reclaimableUntargetedTools(
  detected: readonly SupportedTool[],
): SupportedTool[] {
  return DEPLOY_TOOLS.filter(
    (tool) => tool.skillsDirIsExclusive && !detected.includes(tool.apmTarget),
  ).map((tool) => tool.apmTarget);
}
