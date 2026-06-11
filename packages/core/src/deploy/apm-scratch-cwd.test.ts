import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveApmScratchCwd } from "./apm-scratch-cwd";

describe("resolveApmScratchCwd", () => {
  it("sits under MAESTRO_HOME when set", () => {
    expect(resolveApmScratchCwd({ MAESTRO_HOME: "/sandbox/.maestro" })).toBe(
      join("/sandbox/.maestro", ".apm-scratch"),
    );
  });

  it("falls back to ~/.maestro when MAESTRO_HOME is unset", () => {
    const result = resolveApmScratchCwd({});
    expect(result.endsWith(join(".maestro", ".apm-scratch"))).toBe(true);
  });
});
