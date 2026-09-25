import type { InventoryReader } from "@maestro/core";

// Null is a count that could not be read; it never degrades to 0, which is a
// confirmed empty release.
export async function countPrimitives(
  inventory: InventoryReader,
): Promise<number | null> {
  try {
    const read = await inventory.read();
    return read.ok ? read.primitives.length : null;
  } catch {
    return null;
  }
}
