import { describe, expect, it } from "vitest";
import { ConfigStore } from "../registry/config-store";
import { InMemoryFileSystem } from "../registry/file-system.fake";
import { ConnectInventory } from "./connect-inventory";

const CONFIG_PATH = "/home/me/.maestro/config.json";

function makeConnect(fs: InMemoryFileSystem): ConnectInventory {
  return new ConnectInventory({
    fs,
    store: new ConfigStore({ fs, configPath: CONFIG_PATH }),
  });
}

describe("ConnectInventory", () => {
  it("persists inventoryPath for a clone whose directory contains skills/", async () => {
    const fs = new InMemoryFileSystem({
      directories: {
        "/Users/me/agent-harness": "/Users/me/agent-harness",
        "/Users/me/agent-harness/skills": "/Users/me/agent-harness/skills",
      },
    });
    const connect = makeConnect(fs);

    const result = await connect.connect("/Users/me/agent-harness");

    expect(result).toEqual({
      ok: true,
      inventoryPath: "/Users/me/agent-harness",
    });
    const stored = await new ConfigStore({
      fs,
      configPath: CONFIG_PATH,
    }).read();
    expect(stored.inventoryPath).toBe("/Users/me/agent-harness");
  });

  it("rejects a directory without a skills/ subdirectory and persists nothing", async () => {
    const fs = new InMemoryFileSystem({
      directories: { "/Users/me/not-harness": "/Users/me/not-harness" },
    });
    const connect = makeConnect(fs);

    const result = await connect.connect("/Users/me/not-harness");

    expect(result).toEqual({ ok: false, error: "not-an-inventory" });
    const stored = await new ConfigStore({
      fs,
      configPath: CONFIG_PATH,
    }).read();
    expect(stored.inventoryPath).toBeUndefined();
  });

  it("rejects a relative or traversal path as relative", async () => {
    const fs = new InMemoryFileSystem();
    const connect = makeConnect(fs);

    await expect(connect.connect("../../etc")).resolves.toEqual({
      ok: false,
      error: "relative",
    });
  });

  it("rejects a path that exists but is a file as not-a-directory", async () => {
    const fs = new InMemoryFileSystem({
      files: { "/Users/me/notes.txt": "hello" },
    });
    const connect = makeConnect(fs);

    await expect(connect.connect("/Users/me/notes.txt")).resolves.toEqual({
      ok: false,
      error: "not-a-directory",
    });
  });
});
