import { describe, expect, it } from "vitest";
import { ConfigError, ConfigStore } from "./config-store";
import { InMemoryFileSystem } from "./file-system.fake";

const CONFIG_PATH = "/home/me/.maestro/config.json";

// ConfigStore is the only reader/writer of ~/.maestro/config.json. Driven here
// against the in-memory fake; the real-disk atomic write is covered in
// tests/integration.
describe("ConfigStore", () => {
  it("reads a missing config as an empty registry", async () => {
    const fs = new InMemoryFileSystem();
    const store = new ConfigStore({ fs, configPath: CONFIG_PATH });

    await expect(store.read()).resolves.toEqual({ repos: [] });
  });

  it("round-trips a written registry through read", async () => {
    const fs = new InMemoryFileSystem();
    const store = new ConfigStore({ fs, configPath: CONFIG_PATH });

    await store.write({ repos: [{ path: "/Users/me/project" }] });

    await expect(store.read()).resolves.toEqual({
      repos: [{ path: "/Users/me/project" }],
    });
  });

  it("throws a blocking error on unparseable JSON rather than reading empty", async () => {
    const fs = new InMemoryFileSystem({
      files: { [CONFIG_PATH]: "{ not json" },
    });
    const store = new ConfigStore({ fs, configPath: CONFIG_PATH });

    await expect(store.read()).rejects.toThrow(ConfigError);
  });

  it("throws a blocking error when the config shape is invalid", async () => {
    const fs = new InMemoryFileSystem({
      files: { [CONFIG_PATH]: JSON.stringify({ repos: "not-an-array" }) },
    });
    const store = new ConfigStore({ fs, configPath: CONFIG_PATH });

    await expect(store.read()).rejects.toThrow(ConfigError);
  });
});
