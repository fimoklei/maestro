// Destinations mirror core's DEPLOY_TOOLS skillsDirPrefix. An unknown token is
// shown verbatim, never dropped.

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
