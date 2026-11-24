import { isAbsolute, join, relative, resolve } from "node:path";

export const SUPPORTED_TOOLS = ["claude", "codex"] as const;

export type SupportedTool = (typeof SUPPORTED_TOOLS)[number];

type ToolFolders = {
  skillsDirPrefix: string;
  globalPresenceMarker: string;
  configDir?: { variable: string; marker: string };
};

type DeployTool = ToolFolders & { apmTarget: SupportedTool };

const FOLDERS_BY_TOOL = {
  claude: {
    skillsDirPrefix: ".claude",
    globalPresenceMarker: ".claude.json",
    configDir: { variable: "CLAUDE_CONFIG_DIR", marker: ".claude.json" },
  },
  codex: {
    skillsDirPrefix: ".agents",
    globalPresenceMarker: ".codex/config.toml",
  },
} as const satisfies Record<SupportedTool, ToolFolders>;

export const DEPLOY_TOOLS: readonly DeployTool[] = SUPPORTED_TOOLS.map(
  (apmTarget) => ({ apmTarget, ...FOLDERS_BY_TOOL[apmTarget] }),
);

export type ToolRoots = Readonly<Record<SupportedTool, string>>;

export type GlobalLayout = {
  roots: ToolRoots;
  markers: Readonly<Record<SupportedTool, string>>;
};

const byTool = (value: (tool: DeployTool) => string) =>
  Object.fromEntries(
    DEPLOY_TOOLS.map((tool) => [tool.apmTarget, value(tool)]),
  ) as Record<SupportedTool, string>;

export const REPO_TOOL_ROOTS: ToolRoots = byTool(
  (tool) => tool.skillsDirPrefix,
);

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
  path: string;
  tool: SupportedTool;
  detected: boolean;
};

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

export const APM_DEPLOY_TARGET_FLAG = SUPPORTED_TOOLS.join(",");

export function apmTargetFlagForTools(tools: readonly SupportedTool[]): string {
  return DEPLOY_TOOLS.filter((tool) => tools.includes(tool.apmTarget))
    .map((tool) => tool.apmTarget)
    .join(",");
}

export function deployTargetSubtrees(
  name: string,
  roots: ToolRoots,
  tools?: readonly SupportedTool[],
): string[] {
  return DEPLOY_TOOLS.filter(
    (tool) => tools === undefined || tools.includes(tool.apmTarget),
  ).map((tool) => `${roots[tool.apmTarget]}/skills/${name}`);
}
