import type { Segment } from "../ui/segmented-control";
import type { PrimitiveType } from "../ui/type-tag";

// Data-driven type filter (#288): segments derive from primitives present,
// never a hardcoded list — hooks/mcp/bundles slot in the moment they appear.

export type TypeFilter = "all" | PrimitiveType;

// Fixed order, not derived from key/insertion order, so layout never shifts.
const TYPE_ORDER: readonly PrimitiveType[] = ["skill", "hook", "mcp", "bundle"];

const TYPE_LABEL: Record<PrimitiveType, string> = {
  skill: "skills",
  hook: "hooks",
  mcp: "mcp servers",
  bundle: "bundles",
};

// Empty in, empty out: no primitives means no control at all, never a lone
// `all` that filters nothing.
export function deriveTypeSegments(
  primitives: readonly { type: PrimitiveType }[],
): Segment<TypeFilter>[] {
  const present = new Set(primitives.map((p) => p.type));
  if (present.size === 0) {
    return [];
  }
  return [
    { value: "all", label: "all" },
    ...TYPE_ORDER.filter((type) => present.has(type)).map((type) => ({
      value: type,
      label: TYPE_LABEL[type],
    })),
  ];
}

// Generic over the item shape so a row carrying more than `{ type }` keeps its fields.
export function filterByType<T extends { type: PrimitiveType }>(
  items: readonly T[],
  filter: TypeFilter,
): T[] {
  return filter === "all"
    ? [...items]
    : items.filter((item) => item.type === filter);
}
