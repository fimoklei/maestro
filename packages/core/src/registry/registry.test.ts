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

  it("rejects an invalid path with a typed error and persists nothing", async () => {
    const fs = new InMemoryFileSystem();
    const registry = makeRegistry(fs);

    const result = await registry.register("./relative");

    expect(result).toEqual({ ok: false, error: "relative" });
    await expect(registry.list()).resolves.toEqual([]);
  });
});
