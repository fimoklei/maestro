// Every tool-dependent value derives from DEPLOY_TOOLS, so none can drift
// from the others (#63, #131).

export type SupportedTool = "claude" | "codex";

// One entry per Global folder: the apm target that writes it and its presence
// marker.
type DeployTool = {
  apmTarget: SupportedTool;
  // codex deploys to the cross-client ".agents" dir, not ".codex".
  skillsDirPrefix: string;
  // The tool's own config, never a skills directory a deploy creates.
  globalPresenceMarker: string;
};

// No tool is the only reader of its skills folder, so Maestro never deletes a
// copy for a tool it did not detect (#202, #1557, #1793).

export const DEPLOY_TOOLS: readonly DeployTool[] = [
  {
    apmTarget: "claude",
    skillsDirPrefix: ".claude",
    globalPresenceMarker: ".claude.json",
  },
  {
    apmTarget: "codex",
    skillsDirPrefix: ".agents",
    globalPresenceMarker: ".codex/config.toml",
  },
];

export type GlobalFolder = {
  /** Home-relative, starting with `~/`, as the screen names it. */
  path: string;
  tool: SupportedTool;
  /** Global writes this folder only while its tool is detected. */
  detected: boolean;
};

/** The Global folder a tool's apm target writes, as the screen names it. */
export function globalFolderPath(tool: SupportedTool): string {
  const entry = DEPLOY_TOOLS.find((each) => each.apmTarget === tool);
  return `~/${entry?.skillsDirPrefix ?? tool}/skills`;
}

export function globalFolders(
  detected: readonly SupportedTool[],
): GlobalFolder[] {
  return DEPLOY_TOOLS.map((tool) => ({
    path: globalFolderPath(tool.apmTarget),
    tool: tool.apmTarget,
    detected: detected.includes(tool.apmTarget),
  }));
}

export const SUPPORTED_TOOLS: readonly SupportedTool[] = DEPLOY_TOOLS.map(
  (tool) => tool.apmTarget,
);

// One comma list, never a repeated flag: apm takes the last `-t` only. A repo
// target installs for every tool.
export const APM_DEPLOY_TARGET_FLAG = SUPPORTED_TOOLS.join(",");

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
