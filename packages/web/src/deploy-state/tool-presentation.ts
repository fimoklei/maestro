import { joinNames } from "./join-names";

// A tool's display name. An unknown token is shown verbatim, never dropped.
// Folder paths come from the Global read, never from here.

const LABEL: Record<string, string> = {
  claude: "Claude Code",
  codex: "Codex",
};

export function toolDisplayName(tool: string): string {
  return LABEL[tool] ?? tool;
}

// One readable list ("Claude Code and Codex"). Empty set yields "".
export function toolNameList(tools: readonly string[]): string {
  return joinNames(tools.map(toolDisplayName));
}
