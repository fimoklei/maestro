// Every tool-dependent value derives from DEPLOY_TOOLS, so none can drift
// from the others (#63, #131).
import { isAbsolute, join, relative, resolve } from "node:path";

export type SupportedTool = "claude" | "codex";

// One entry per Global folder: the apm target that writes it and its presence
// marker.
type DeployTool = {
  apmTarget: SupportedTool;
  // codex deploys to the cross-client ".agents" dir, not ".codex".
  skillsDirPrefix: string;
  // The tool's own config, never a skills directory a deploy creates.
  globalPresenceMarker: string;
  // At user scope apm and the tool move the folder and the marker into this
  // variable's directory.
  configDir?: { variable: string; marker: string };
};

// No tool is the only reader of its skills folder, so Maestro never deletes a
// copy for a tool it did not detect (#202, #1557, #1793).

export const DEPLOY_TOOLS: readonly DeployTool[] = [
  {
    apmTarget: "claude",
    skillsDirPrefix: ".claude",
    globalPresenceMarker: ".claude.json",
    configDir: { variable: "CLAUDE_CONFIG_DIR", marker: ".claude.json" },
  },
  {
    apmTarget: "codex",
    skillsDirPrefix: ".agents",
    globalPresenceMarker: ".codex/config.toml",
  },
];

/** Per tool, the folder holding a target's `skills/`: relative to the target's tree root, or absolute. */
export type ToolRoots = Readonly<Record<SupportedTool, string>>;

/** Where Global writes each tool's skills and finds its marker; each path relative to home, or absolute. */
export type GlobalLayout = {
  roots: ToolRoots;
  markers: Readonly<Record<SupportedTool, string>>;
};

// The cast is safe: DEPLOY_TOOLS holds one entry per SupportedTool.
const byTool = (value: (tool: DeployTool) => string) =>
  Object.fromEntries(
    DEPLOY_TOOLS.map((tool) => [tool.apmTarget, value(tool)]),
  ) as Record<SupportedTool, string>;

/** A repo target always writes the default folders. */
export const REPO_TOOL_ROOTS: ToolRoots = byTool(
  (tool) => tool.skillsDirPrefix,
);

/**
 * Global's layout as apm 0.32.0 resolves it from the environment it receives:
 * a blank variable is unset; `~` expands, a relative value resolves against
 * apm's cwd, and symlinks resolve on both the value and home.
 */
export function resolveGlobalLayout(input: {
  env: NodeJS.ProcessEnv;
  home: string;
  apmCwd: string;
  // Follows the symlinks of the longest existing prefix; never throws.
  realpath: (path: string) => string;
}): GlobalLayout {
  const moved = (tool: DeployTool): string | null => {
    if (tool.configDir === undefined) return null;
    const value = input.env[tool.configDir.variable]?.trim() ?? "";
    if (value === "") return null;
    const expanded =
      value === "~" || value.startsWith("~/")
        ? join(input.home, value.slice(1))
        : value;
    const dir = input.realpath(resolve(input.apmCwd, expanded));
    const home = input.realpath(resolve(input.home));
    const inside = relative(home, dir);
    const outside =
      inside === "" ||
      inside === ".." ||
      inside.startsWith("../") ||
      isAbsolute(inside);
    return !outside ? inside : dir;
  };
  const dirs = new Map(DEPLOY_TOOLS.map((tool) => [tool, moved(tool)]));
  return {
    roots: byTool((tool) => dirs.get(tool) ?? tool.skillsDirPrefix),
    markers: byTool((tool) => {
      const dir = dirs.get(tool);
      return dir == null || tool.configDir === undefined
        ? tool.globalPresenceMarker
        : `${dir}/${tool.configDir.marker}`;
    }),
  };
}

export type GlobalFolder = {
  /** Starting with `~/` inside home, absolute outside it, as the screen names it. */
  path: string;
  tool: SupportedTool;
  /** Global writes this folder only while its tool is detected. */
  detected: boolean;
};

/** The Global folder a tool's apm target writes, as the screen names it. */
export function globalFolderPath(
  tool: SupportedTool,
  layout: GlobalLayout,
): string {
  const root = layout.roots[tool];
  return isAbsolute(root) ? `${root}/skills` : `~/${root}/skills`;
}

export function globalFolders(
  detected: readonly SupportedTool[],
  layout: GlobalLayout,
): GlobalFolder[] {
  return DEPLOY_TOOLS.map((tool) => ({
    path: globalFolderPath(tool.apmTarget, layout),
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

// Relative to the deployed root or absolute, like the lockfile's
// deployed_file_hashes. Omitting `tools` means every DEPLOY_TOOLS tool.
export function deployTargetSubtrees(
  name: string,
  roots: ToolRoots,
  tools?: readonly SupportedTool[],
): string[] {
  return DEPLOY_TOOLS.filter(
    (tool) => tools === undefined || tools.includes(tool.apmTarget),
  ).map((tool) => `${roots[tool.apmTarget]}/skills/${name}`);
}
