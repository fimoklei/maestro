import type { InventoryReader } from "@maestro/core";

// Read through the same InventoryReader the primitives route uses, so the two
// cannot drift. Null is a count that could not be read; it never degrades to 0,
// which is a confirmed empty release (ADR-0021 §8). A read failure still leaves
// an already-successful connect or scaffold successful.
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
