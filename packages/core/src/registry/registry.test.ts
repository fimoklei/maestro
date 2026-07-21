import { describe, expect, it } from "vitest";
import { ConfigStore } from "./config-store";
import { InMemoryFileSystem } from "./file-system.fake";
import { Registry } from "./registry";

const CONFIG_PATH = "/home/me/.maestro/config.json";

function makeRegistry(fs: InMemoryFileSystem): Registry {
  return new Registry({
    fs,
    store: new ConfigStore({ fs, configPath: CONFIG_PATH }),
  });
}

describe("Registry", () => {
  it("registers a valid directory and lists it back", async () => {
    const fs = new InMemoryFileSystem({
      directories: { "/Users/me/project": "/Users/me/project" },
    });
    const registry = makeRegistry(fs);

    const result = await registry.register("/Users/me/project");

    expect(result).toEqual({
      ok: true,
      repos: [{ path: "/Users/me/project" }],
    });
    await expect(registry.list()).resolves.toEqual([
      { path: "/Users/me/project" },
    ]);
  });

  it("does not duplicate a repo registered twice", async () => {
    const fs = new InMemoryFileSystem({
      directories: { "/Users/me/project": "/Users/me/project" },
    });
    const registry = makeRegistry(fs);

    await registry.register("/Users/me/project");
    await registry.register("/Users/me/project");

    await expect(registry.list()).resolves.toEqual([
      { path: "/Users/me/project" },
    ]);
  });

  it("keeps both repos when two registrations run concurrently", async () => {
    const fs = new InMemoryFileSystem({
      directories: {
        "/Users/me/a": "/Users/me/a",
        "/Users/me/b": "/Users/me/b",
      },
    });
    const registry = makeRegistry(fs);

    await Promise.all([
      registry.register("/Users/me/a"),
      registry.register("/Users/me/b"),
    ]);

    const paths = (await registry.list()).map((r) => r.path).sort();
    expect(paths).toEqual(["/Users/me/a", "/Users/me/b"]);
  });

  it("preserves a previously connected inventoryPath when registering a repo", async () => {
    const configPath = CONFIG_PATH;
    const fs = new InMemoryFileSystem({
      directories: { "/Users/me/project": "/Users/me/project" },
      files: {
        [configPath]: JSON.stringify({ repos: [], inventoryPath: "/inv" }),
      },
    });
    const store = new ConfigStore({ fs, configPath });
    const registry = new Registry({ fs, store });

    await registry.register("/Users/me/project");

    await expect(store.read()).resolves.toEqual({
      repos: [{ path: "/Users/me/project" }],
      inventoryPath: "/inv",
    });
  });

  it("refuses the connected central inventory as a consuming repo", async () => {
    const fs = new InMemoryFileSystem({
      directories: {
        "/Users/me/agent-harness": "/Users/me/agent-harness",
      },
      files: {
        [CONFIG_PATH]: JSON.stringify({
          repos: [],
          inventoryPath: "/Users/me/agent-harness",
        }),
      },
    });
    const registry = makeRegistry(fs);

    await expect(registry.register("/Users/me/agent-harness")).resolves.toEqual(
      { ok: false, error: "central-inventory" },
    );
    await expect(registry.list()).resolves.toEqual([]);
  });

  it("rejects an invalid path with a typed error and persists nothing", async () => {
    const fs = new InMemoryFileSystem();
    const registry = makeRegistry(fs);

    const result = await registry.register("./relative");

    expect(result).toEqual({ ok: false, error: "relative" });
    await expect(registry.list()).resolves.toEqual([]);
  });

  describe("isRegistered", () => {
    it("is true for a path that was registered", async () => {
      const fs = new InMemoryFileSystem({
        directories: { "/Users/me/project": "/Users/me/project" },
      });
      const registry = makeRegistry(fs);
      await registry.register("/Users/me/project");

      await expect(registry.isRegistered("/Users/me/project")).resolves.toBe(
        true,
      );
    });

    it("is false for a path that was never registered", async () => {
      const fs = new InMemoryFileSystem({
        directories: {
          "/Users/me/project": "/Users/me/project",
          "/Users/me/other": "/Users/me/other",
        },
      });
      const registry = makeRegistry(fs);
      await registry.register("/Users/me/project");

      await expect(registry.isRegistered("/Users/me/other")).resolves.toBe(
        false,
      );
    });

    it("is false for a path that does not exist", async () => {
      const fs = new InMemoryFileSystem();
      const registry = makeRegistry(fs);

      await expect(registry.isRegistered("/Users/me/ghost")).resolves.toBe(
        false,
      );
    });

    it("canonicalizes the input before comparing, so a symlink to a registered repo matches", async () => {
      const fs = new InMemoryFileSystem({
        directories: {
          "/Users/me/project": "/Users/me/project",
          // A symlink whose realpath is the registered repo.
          "/Users/me/link": "/Users/me/project",
        },
      });
      const registry = makeRegistry(fs);
      await registry.register("/Users/me/project");

      await expect(registry.isRegistered("/Users/me/link")).resolves.toBe(true);
    });
  });
});
