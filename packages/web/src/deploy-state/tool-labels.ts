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

// The same names as one readable list, for a sentence that has to state a whole
// scope ("Claude Code and Codex"). An empty set yields an empty string; the
// caller decides whether that sentence is worth showing.
export function toolNameList(tools: readonly string[]): string {
  const names = tools.map(toolDisplayName);
  if (names.length < 2) {
    return names[0] ?? "";
  }
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
