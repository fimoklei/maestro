import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createVitest } from "vitest/node";

describe("the test lanes", () => {
  // vitest refuses a run whose lanes differ in maxWorkers (#1699). Only a
  // battery-capped machine tells the lanes apart; elsewhere all default.
  it("all resolve the same worker cap", async () => {
    const vitest = await createVitest({
      config: fileURLToPath(new URL("../../vitest.config.ts", import.meta.url)),
      watch: false,
    });
    try {
      const caps = Object.fromEntries(
        vitest.projects.map((lane) => [lane.name, lane.config.maxWorkers]),
      );
      expect(new Set(Object.values(caps)).size, JSON.stringify(caps)).toBe(1);
    } finally {
      await vitest.close();
    }
  });
});
