// A global target's name + destination path. Destinations mirror core's
// DEPLOY_TOOLS skillsDirPrefix (apm-driver.md). Unknown token shown verbatim,
// never dropped (J03).

export type ToolPresentation = {
  label: string;
  destination: string;
};

const PRESENTATION: Record<string, ToolPresentation> = {
  claude: { label: "Claude Code", destination: "~/.claude/skills" },
  codex: { label: "Codex", destination: "~/.agents/skills" },
};

export function toolPresentation(tool: string): ToolPresentation {
  return PRESENTATION[tool] ?? { label: tool, destination: "" };
}
