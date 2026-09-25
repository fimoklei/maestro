import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveMaestroConfigPath } from "./config-path";

describe("resolveMaestroConfigPath", () => {
  it("uses MAESTRO_HOME when it is set", () => {
    expect(resolveMaestroConfigPath({ MAESTRO_HOME: "/tmp/sandbox" })).toBe(
      "/tmp/sandbox/config.json",
    );
  });

  it("falls back to ~/.maestro when MAESTRO_HOME is unset", () => {
    expect(resolveMaestroConfigPath({})).toBe(
      join(homedir(), ".maestro", "config.json"),
    );
  });
});
