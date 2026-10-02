import { joinNames } from "./join-names";

// Destinations mirror core's DEPLOY_TOOLS skillsDirPrefix. An unknown token is
// shown verbatim, never dropped.

type ToolPresentation = {
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

export function toolDisplayName(tool: string): string {
  return toolPresentation(tool).label;
}

// One readable list ("Claude Code and Codex"). Empty set yields "".
export function toolNameList(tools: readonly string[]): string {
  return joinNames(tools.map(toolDisplayName));
}
