import type { InventoryReader } from "@maestro/core";

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
