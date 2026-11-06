// A tool's display name. An unknown token is shown verbatim, never dropped.
// Folder paths come from the Global read, never from here.
import type { SupportedTool } from "@maestro/core";

const LABEL: Record<SupportedTool, string> = {
  claude: "Claude Code",
  codex: "Codex",
};

/** The tools that load skills from a tool's Global folder; `others`: the list is not complete. */
export type ReadBy = { tools: readonly string[]; others: boolean };

const READ_BY: Record<SupportedTool, ReadBy> = {
  claude: { tools: ["Claude Code", "Cursor", "OpenCode"], others: false },
  codex: {
    tools: ["Codex", "Copilot CLI", "Cursor", "Gemini CLI"],
    others: true,
  },
};

export const readByOf = (tool: SupportedTool): ReadBy => READ_BY[tool];

export const isSupportedTool = (value: unknown): value is SupportedTool =>
  typeof value === "string" && Object.hasOwn(LABEL, value);

export function toolDisplayName(tool: string): string {
  return isSupportedTool(tool) ? LABEL[tool] : tool;
}
