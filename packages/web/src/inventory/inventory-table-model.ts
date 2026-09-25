// Pure search model for the inventory table (#287).
import type { Primitive } from "./use-inventory";

// Name only, case-insensitive — matching descriptions would surprise the
// user with rows whose visible name looks unrelated.
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
