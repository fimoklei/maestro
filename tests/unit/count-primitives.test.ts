import type { InventoryReader } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { countPrimitives } from "../../packages/server/src/count-primitives";

const throwing = {
  read: async () => {
    throw new Error("disk gone");
  },
} as unknown as InventoryReader;

describe("countPrimitives", () => {
  it("answers null, never 0, when the read throws", async () => {
    expect(await countPrimitives(throwing)).toBeNull();
  });
});
