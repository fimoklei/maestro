import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveApmGlobalRoot,
  resolveApmScratchCwd,
  resolveMaestroConfigPath,
} from "./home-directory";

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

describe("resolveApmScratchCwd", () => {
  it("sits under MAESTRO_HOME when set", () => {
    expect(resolveApmScratchCwd({ MAESTRO_HOME: "/sandbox/.maestro" })).toBe(
      join("/sandbox/.maestro", ".apm-scratch"),
    );
  });

  it("falls back to ~/.maestro when MAESTRO_HOME is unset", () => {
    expect(resolveApmScratchCwd({})).toBe(
      join(homedir(), ".maestro", ".apm-scratch"),
    );
  });
});

// HOME-redirectable, so tests never touch the real ~/.apm.
describe("resolveApmGlobalRoot", () => {
  it("resolves the apm user-scope directory under the home directory", () => {
    expect(resolveApmGlobalRoot({ HOME: "/sandbox/home" })).toBe(
      join("/sandbox/home", ".apm"),
    );
  });

  it("falls back to the OS home directory when HOME is unset", () => {
    expect(resolveApmGlobalRoot({})).toBe(join(homedir(), ".apm"));
  });
});
