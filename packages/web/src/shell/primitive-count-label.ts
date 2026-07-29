// Shared count label: "reading…" while the count query is still resolving
// (separate query from config), singular for one primitive.
export function primitiveCountLabel(count: number | undefined): string {
  if (count === undefined) return "reading…";
  return `${count} ${count === 1 ? "primitive" : "primitives"}`;
}
