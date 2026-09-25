// Every tool-dependent value derives from DEPLOY_TOOLS, so none can drift
// from the others (#63, #131).

export type SupportedTool = "claude" | "codex";

type DeployTool = {
  apmTarget: SupportedTool;
  // codex deploys to the cross-client ".agents" dir, not ".codex".
  skillsDirPrefix: string;
  // The tool's own config, never a skills directory a deploy creates.
  globalPresenceMarker: string;
  // Whether this tool is the only reader of skillsDirPrefix. Never default it
  // to true (#202).
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
    // Ten apm targets read the shared agents skills folder.
    skillsDirIsExclusive: false,
  },
];

// One comma list, never a repeated flag: apm takes the last `-t` only.
export const APM_DEPLOY_TARGET_FLAG = DEPLOY_TOOLS.map(
  (tool) => tool.apmTarget,
).join(",");

// Empty when nothing is detected; the caller refuses before apm runs.
export function apmTargetFlagForTools(tools: readonly SupportedTool[]): string {
  return DEPLOY_TOOLS.filter((tool) => tools.includes(tool.apmTarget))
    .map((tool) => tool.apmTarget)
    .join(",");
}

// Relative to the deployed root, like the lockfile's deployed_file_hashes.
// Omitting `tools` means every DEPLOY_TOOLS tool.
export function deployTargetSubtrees(
  name: string,
  tools?: readonly SupportedTool[],
): string[] {
  return DEPLOY_TOOLS.filter(
    (tool) => tools === undefined || tools.includes(tool.apmTarget),
  ).map((tool) => `${tool.skillsDirPrefix}/skills/${name}`);
}

// Exclusive directories only: removing a shared one costs another tool its
// skills (#202).
export function reclaimableUntargetedTools(
  detected: readonly SupportedTool[],
): SupportedTool[] {
  return DEPLOY_TOOLS.filter(
    (tool) => tool.skillsDirIsExclusive && !detected.includes(tool.apmTarget),
  ).map((tool) => tool.apmTarget);
}
