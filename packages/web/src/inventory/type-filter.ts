import type { Primitive } from "./use-inventory";

// Data-driven type filter (#288): options derive from primitives present,
// never a hardcoded list — hooks/mcp/bundles slot in the moment they appear.

export type PrimitiveType = "skill" | "hook" | "mcp" | "bundle";

// Fixed order, not derived from key/insertion order, so layout never shifts.
const TYPE_ORDER: readonly PrimitiveType[] = ["skill", "hook", "mcp", "bundle"];

export const TYPE_LABEL: Record<PrimitiveType, string> = {
  skill: "Skills",
  hook: "Hooks",
  mcp: "MCP servers",
  bundle: "Bundles",
};

// A row's Type cell: the plain word, no hue and no icon (#987).
export const TYPE_WORD: Record<PrimitiveType, string> = {
  skill: "Skill",
  hook: "Hook",
  mcp: "MCP server",
  bundle: "Bundle",
};

/** One option per type present; Filter adds "All". */
export function deriveTypeSegments(
  primitives: readonly { type: PrimitiveType }[],
): { value: PrimitiveType; label: string }[] {
  const present = new Set(primitives.map((p) => p.type));
  return TYPE_ORDER.filter((type) => present.has(type)).map((type) => ({
    value: type,
    label: TYPE_LABEL[type],
  }));
}

// Name only, case-insensitive — matching descriptions would surprise the
// user with rows whose visible name looks unrelated (#287).
export function filterByName<T extends Primitive>(
  primitives: T[],
  query: string,
): T[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return primitives;
  }
  return primitives.filter((p) => p.name.toLowerCase().includes(needle));
}
