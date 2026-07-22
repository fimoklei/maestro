import type { Segment } from "../ui/segmented-control";
import type { PrimitiveType } from "../ui/type-tag";

// Data-driven type filter for the inventory table (#288). The segment set is
// derived from the primitives present, never a hardcoded five, so the control
// reflects what the user has. Today that is `all` + `skills`; hooks/mcp/bundles
// slot in additively the moment the inventory carries them.

export type TypeFilter = "all" | PrimitiveType;

// Canonical order the segments render in — fixed, not derived from key or
// insertion order, so the control's layout never shifts under the same data.
const TYPE_ORDER: readonly PrimitiveType[] = ["skill", "hook", "mcp", "bundle"];

// Plural control labels from the redesign screen (docs/design/inventory-redesign).
// The tag reads the singular type; the filter segment reads the plural set.
const TYPE_LABEL: Record<PrimitiveType, string> = {
  skill: "skills",
  hook: "hooks",
  mcp: "mcp servers",
  bundle: "bundles",
};

// `all` plus one segment per type actually present, in canonical order. Empty in,
// empty out: an inventory with no primitives shows no control at all (the caller
// renders its own empty state), never a lone `all` that filters nothing.
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

// Narrows a list to the selected type; `all` passes everything through. Generic
// over the item shape so a row carrying more than `{ type }` keeps its fields.
export function filterByType<T extends { type: PrimitiveType }>(
  items: readonly T[],
  filter: TypeFilter,
): T[] {
  return filter === "all"
    ? [...items]
    : items.filter((item) => item.type === filter);
}
