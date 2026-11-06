// Every tool-dependent value derives from DEPLOY_TOOLS, so none can drift
// from the others (#63, #131).

export type SupportedTool = "claude" | "codex";

/** The tools that load skills from a Global folder; `others`: the list is not complete. */
type ReadBy = { tools: readonly string[]; others: boolean };

// One entry per Global folder: the apm target that writes it, its presence
// marker and the tools that read it.
type DeployTool = {
  apmTarget: SupportedTool;
  // codex deploys to the cross-client ".agents" dir, not ".codex".
  skillsDirPrefix: string;
  // The tool's own config, never a skills directory a deploy creates.
  globalPresenceMarker: string;
  readBy: ReadBy;
};

// No tool is the only reader of its skills folder, so Maestro never deletes a
// copy for a tool it did not detect (#202, #1557, #1793).

export const DEPLOY_TOOLS: readonly DeployTool[] = [
  {
    apmTarget: "claude",
    skillsDirPrefix: ".claude",
    globalPresenceMarker: ".claude.json",
    readBy: { tools: ["Claude Code", "Cursor", "OpenCode"], others: false },
  },
  {
    apmTarget: "codex",
    skillsDirPrefix: ".agents",
    globalPresenceMarker: ".codex/config.toml",
    readBy: {
      tools: ["Codex", "Copilot CLI", "Cursor", "Gemini CLI"],
      others: true,
    },
  },
];

export type GlobalFolder = {
  /** Home-relative, starting with `~/`, as the screen names it. */
  path: string;
  tool: SupportedTool;
  /** Global writes this folder only while its tool is detected. */
  detected: boolean;
  readBy: ReadBy;
};

export function globalFolders(
  detected: readonly SupportedTool[],
): GlobalFolder[] {
  return DEPLOY_TOOLS.map((tool) => ({
    path: `~/${tool.skillsDirPrefix}/skills`,
    tool: tool.apmTarget,
    detected: detected.includes(tool.apmTarget),
    readBy: tool.readBy,
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
