import { toolDisplayName } from "../deploy-state/tool-labels";

// #134, ADR-0011. undefined = not yet loaded/unreadable → plain "Global",
// never claim a tool set we can't prove. Empty = zero detected tools.
export function globalOptionLabel(
  tools: readonly string[] | undefined,
): string {
  if (tools === undefined) {
    return "Global";
  }
  if (tools.length === 0) {
    return "Global (no tool detected)";
  }
  return `Global (${tools.map(toolDisplayName).join(" + ")})`;
}
