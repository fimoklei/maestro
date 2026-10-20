import type { HarnessPrimitiveType } from "@maestro/core";
import type { Primitive } from "./use-inventory";

export type PrimitiveType = "skill" | "hook" | "mcp" | "bundle";

// A row's Type cell: the plain word, no hue and no icon (#987).
export const TYPE_WORD: Record<PrimitiveType | HarnessPrimitiveType, string> = {
  skill: "Skill",
  prompt: "Prompt",
  hook: "Hook",
  mcp: "MCP server",
  bundle: "Bundle",
};

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
