// A shared, offline count label for the connected inventory. The count comes
// from a separate query than the config, so it can still be resolving after the
// path is known — show "reading…" rather than a bare "undefined", and
// singularise a lone primitive. Used by both the header source entry and the
// Inventory source view so they read identically.
export function primitiveCountLabel(count: number | undefined): string {
  if (count === undefined) return "reading…";
  return `${count} ${count === 1 ? "primitive" : "primitives"}`;
}
