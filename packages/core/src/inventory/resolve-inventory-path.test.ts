import { describe, expect, it } from "vitest";
import { resolveInventoryPath } from "./resolve-inventory-path";

describe("resolveInventoryPath", () => {
  it("prefers the configured inventoryPath over the env var", () => {
    const path = resolveInventoryPath(
      { repos: [], inventoryPath: "/from/config" },
      { MAESTRO_INVENTORY_PATH: "/from/env" },
    );

    expect(path).toBe("/from/config");
  });

  it("falls back to MAESTRO_INVENTORY_PATH when config has no path", () => {
    const path = resolveInventoryPath(
      { repos: [] },
      { MAESTRO_INVENTORY_PATH: "/from/env" },
    );

    expect(path).toBe("/from/env");
  });

  it("is undefined when neither config nor env provides a path", () => {
    const path = resolveInventoryPath({ repos: [] }, {});

    expect(path).toBeUndefined();
  });
});
