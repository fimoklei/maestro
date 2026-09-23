import { describe, expect, it } from "vitest";
import { resolveInventoryPath } from "../inventory/resolve-inventory-path";
import { ConfigStore } from "./config-store";
import { InMemoryFileSystem } from "./file-system.fake";
import { Registry } from "./registry";

const CONFIG_PATH = "/home/me/.maestro/config.json";

// What the server injects, with an empty env so the ambient
// MAESTRO_INVENTORY_PATH cannot reach these tests.
const resolveCentralInventoryPath = (
  config: Parameters<typeof resolveInventoryPath>[0],
) => resolveInventoryPath(config, {});

// A Git repository: the folder plus its `.git` entry.
const gitRepos = (...paths: string[]): Record<string, string> =>
  Object.fromEntries(
    paths.flatMap((path) => [
      [path, path],
      [`${path}/.git`, `${path}/.git`],
    ]),
  );

function makeRegistry(fs: InMemoryFileSystem): Registry {
  return new Registry({
    fs,
    store: new ConfigStore({ fs, configPath: () => CONFIG_PATH }),
    resolveCentralInventoryPath,
  });
}

describe("Registry", () => {
  it("registers a valid directory and lists it back", async () => {
    const fs = new InMemoryFileSystem({
      directories: gitRepos("/Users/me/project"),
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

  it("refuses a repo registered twice and keeps one entry", async () => {
    const fs = new InMemoryFileSystem({
      directories: {
        ...gitRepos("/Users/me/project"),
        "/Users/me/link": "/Users/me/project",
      },
    });
    const registry = makeRegistry(fs);

    await registry.register("/Users/me/project");

    // A symlink to it is the same repository.
    await expect(registry.register("/Users/me/link")).resolves.toEqual({
      ok: false,
      error: "already-registered",
    });
    await expect(registry.list()).resolves.toEqual([
      { path: "/Users/me/project" },
    ]);
  });

  it("refuses a folder that is not a Git repository", async () => {
    const fs = new InMemoryFileSystem({
      directories: { "/Users/me/notes": "/Users/me/notes" },
    });
    const registry = makeRegistry(fs);

    await expect(registry.register("/Users/me/notes")).resolves.toEqual({
      ok: false,
      error: "not-a-git-repo",
    });
    await expect(registry.list()).resolves.toEqual([]);
  });

  it("counts a worktree, whose .git is a file, as a Git repository", async () => {
    const fs = new InMemoryFileSystem({
      directories: { "/Users/me/wt": "/Users/me/wt" },
      files: { "/Users/me/wt/.git": "gitdir: /Users/me/project/.git" },
    });
    const registry = makeRegistry(fs);

    await expect(registry.register("/Users/me/wt")).resolves.toMatchObject({
      ok: true,
    });
  });

  it("keeps both repos when two registrations run concurrently", async () => {
    const fs = new InMemoryFileSystem({
      directories: gitRepos("/Users/me/a", "/Users/me/b"),
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
      directories: gitRepos("/Users/me/project"),
      files: {
        [configPath]: JSON.stringify({ repos: [], inventoryPath: "/inv" }),
      },
    });
    const store = new ConfigStore({ fs, configPath: () => configPath });
    const registry = new Registry({ fs, store, resolveCentralInventoryPath });

    await registry.register("/Users/me/project");

    await expect(store.read()).resolves.toEqual({
      repos: [{ path: "/Users/me/project" }],
      inventoryPath: "/inv",
    });
  });

  it("refuses the connected central inventory as a consuming repo", async () => {
    const fs = new InMemoryFileSystem({
      directories: gitRepos("/Users/me/agent-harness"),
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

  describe("check", () => {
    it("answers what a registration would, and writes nothing", async () => {
      const fs = new InMemoryFileSystem({
        directories: {
          ...gitRepos("/Users/me/project", "/Users/me/agent-harness"),
          "/Users/me/notes": "/Users/me/notes",
        },
        files: {
          [CONFIG_PATH]: JSON.stringify({
            repos: [],
            inventoryPath: "/Users/me/agent-harness",
          }),
          "/Users/me/file.txt": "",
        },
      });
      const registry = makeRegistry(fs);

      await expect(registry.check("/Users/me/project")).resolves.toEqual({
        ok: true,
        path: "/Users/me/project",
      });
      await expect(registry.check("/Users/me/notes")).resolves.toEqual({
        ok: false,
        error: "not-a-git-repo",
      });
      await expect(registry.check("/Users/me/agent-harness")).resolves.toEqual({
        ok: false,
        error: "central-inventory",
      });
      await expect(registry.check("/Users/me/ghost")).resolves.toEqual({
        ok: false,
        error: "not-found",
      });
      await expect(registry.check("/Users/me/file.txt")).resolves.toEqual({
        ok: false,
        error: "not-a-directory",
      });
      await expect(registry.list()).resolves.toEqual([]);
    });

    it("refuses a repo already registered", async () => {
      const fs = new InMemoryFileSystem({
        directories: gitRepos("/Users/me/project"),
      });
      const registry = makeRegistry(fs);
      await registry.register("/Users/me/project");

      await expect(registry.check("/Users/me/project")).resolves.toEqual({
        ok: false,
        error: "already-registered",
      });
    });
  });

  describe("unregister", () => {
    it("drops the named repo and keeps the others", async () => {
      const fs = new InMemoryFileSystem({
        directories: gitRepos("/Users/me/a", "/Users/me/b"),
      });
      const registry = makeRegistry(fs);
      await registry.register("/Users/me/a");
      await registry.register("/Users/me/b");

      await expect(registry.unregister("/Users/me/a")).resolves.toEqual({
        ok: true,
        repos: [{ path: "/Users/me/b" }],
      });
      await expect(registry.list()).resolves.toEqual([{ path: "/Users/me/b" }]);
    });

    it("drops a repo whose folder is gone, by its stored path", async () => {
      const configPath = CONFIG_PATH;
      const fs = new InMemoryFileSystem({
        files: {
          [configPath]: JSON.stringify({
            repos: [{ path: "/Users/me/old-site" }],
            inventoryPath: "/inv",
          }),
        },
      });
      const store = new ConfigStore({ fs, configPath: () => configPath });
      const registry = new Registry({ fs, store, resolveCentralInventoryPath });

      await expect(registry.unregister("/Users/me/old-site")).resolves.toEqual({
        ok: true,
        repos: [],
      });
      // The rest of the config survives the rewrite.
      await expect(store.read()).resolves.toEqual({
        repos: [],
        inventoryPath: "/inv",
      });
    });

    it("refuses a path that is not registered", async () => {
      const fs = new InMemoryFileSystem({
        directories: gitRepos("/Users/me/a"),
      });
      const registry = makeRegistry(fs);

      await expect(registry.unregister("/Users/me/a")).resolves.toEqual({
        ok: false,
        error: "not-registered",
      });
    });
  });

  describe("listWithStatus", () => {
    it("reads each folder: ready, missing, or no longer a Git repository", async () => {
      const fs = new InMemoryFileSystem({
        directories: {
          ...gitRepos("/Users/me/ready"),
          "/Users/me/scratch": "/Users/me/scratch",
        },
        files: {
          [CONFIG_PATH]: JSON.stringify({
            repos: [
              { path: "/Users/me/ready" },
              { path: "/Users/me/scratch" },
              { path: "/Users/me/old-site" },
            ],
          }),
        },
      });
      const registry = makeRegistry(fs);

      await expect(registry.listWithStatus()).resolves.toEqual([
        { path: "/Users/me/ready", status: "ready" },
        { path: "/Users/me/scratch", status: "not-a-git-repo" },
        { path: "/Users/me/old-site", status: "folder-missing" },
      ]);
    });
  });

  describe("isRegistered", () => {
    it("is true for a path that was registered", async () => {
      const fs = new InMemoryFileSystem({
        directories: gitRepos("/Users/me/project"),
      });
      const registry = makeRegistry(fs);
      await registry.register("/Users/me/project");

      await expect(registry.isRegistered("/Users/me/project")).resolves.toBe(
        true,
      );
    });

    it("is false for a path that was never registered", async () => {
      const fs = new InMemoryFileSystem({
        directories: gitRepos("/Users/me/project", "/Users/me/other"),
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
          ...gitRepos("/Users/me/project"),
          // A symlink whose realpath is the registered repo.
          "/Users/me/link": "/Users/me/project",
        },
      });
      const registry = makeRegistry(fs);
      await registry.register("/Users/me/project");

      await expect(registry.isRegistered("/Users/me/link")).resolves.toBe(true);
    });
  });

  describe("resolveRegistered", () => {
    it("returns the canonical registered repo for a symlinked input", async () => {
      const fs = new InMemoryFileSystem({
        directories: {
          ...gitRepos("/Users/me/project"),
          "/Users/me/link": "/Users/me/project",
        },
      });
      const registry = makeRegistry(fs);
      await registry.register("/Users/me/project");

      await expect(
        registry.resolveRegistered("/Users/me/link"),
      ).resolves.toEqual({ path: "/Users/me/project" });
    });

    it("returns nothing for a repo that is not registered", async () => {
      const fs = new InMemoryFileSystem({
        directories: gitRepos("/Users/me/project"),
      });
      const registry = makeRegistry(fs);

      await expect(
        registry.resolveRegistered("/Users/me/project"),
      ).resolves.toBeUndefined();
    });
  });
});
