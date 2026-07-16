// Human names for apm's tool tokens. The server speaks apm's `-t` tokens
// ("claude"/"codex"); the cockpit names the product ("Claude Code"/"Codex")
// wherever it shows a deploy target's tool. An unknown token renders verbatim so
// a newly-supported tool degrades to its token rather than vanishing.
const TOOL_DISPLAY_NAME: Record<string, string> = {
  claude: "Claude Code",
  codex: "Codex",
};

export function toolDisplayName(tool: string): string {
  return TOOL_DISPLAY_NAME[tool] ?? tool;
}
