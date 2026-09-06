import { joinNames } from "./join-names";
import { toolPresentation } from "./tool-presentation";

// Human names for apm's tool tokens. An unknown token renders verbatim, so a
// newly-supported tool degrades to its token rather than vanishing.
export function toolDisplayName(tool: string): string {
  return toolPresentation(tool).label;
}

// One readable list ("Claude Code and Codex"). Empty set yields "".
export function toolNameList(tools: readonly string[]): string {
  return joinNames(tools.map(toolDisplayName));
}
