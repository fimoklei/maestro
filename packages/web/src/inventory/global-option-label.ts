import { toolDisplayName } from "../deploy-state/tool-labels";

// undefined = not loaded or unreadable → plain "Global"; empty = zero detected
// tools (#134).
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
