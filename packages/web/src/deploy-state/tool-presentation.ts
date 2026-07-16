// How a global deploy target reads on screen: its human name (the headline) and
// its concrete destination path (the secondary detail). Keyed on the tool token
// the deploy-state API sends (apm's own `-t` identity: "claude" / "codex"). This
// is presentation, so it lives in web, not core — but the destinations mirror
// core's DEPLOY_TOOLS skillsDirPrefix (a codex skill lands under the shared
// ".agents" dir, never ".codex" — apm-driver.md). An unknown token is shown by
// its raw identity rather than dropped, the same "never silently hide" honesty
// the deploy-state read keeps (J03).

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
