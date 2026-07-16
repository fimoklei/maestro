import { toolDisplayName } from "../deploy-state/tool-labels";

// The deploy picker's single "Global" option names the tools it will actually
// hit, read from the global deploy-state's detected-tool set (#134, ADR-0011).
// `undefined` = not yet loaded or unreadable → plain "Global": never claim a
// tool set we cannot prove. An empty array = detected zero tools → the label
// says so and the caller disables the option so Maestro writes nothing.
export function globalOptionLabel(
  tools: readonly string[] | undefined,
): string {
  if (tools === undefined) {
    return "Global";
  }
  if (tools.length === 0) {
    return "Global (no tools detected)";
  }
  return `Global (${tools.map(toolDisplayName).join(" + ")})`;
}
