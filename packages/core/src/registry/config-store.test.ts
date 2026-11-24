import { describe, expect, it, vi } from "vitest";
import { ConfigStore } from "./config-store";
import { InMemoryFileSystem } from "./file-system.fake";

const CONFIG_PATH = "/home/me/.maestro/config.json";

describe("ConfigStore", () => {
  it("reads a missing config as an empty registry", async () => {
    const fs = new InMemoryFileSystem();
    const store = new ConfigStore({ fs, configPath: () => CONFIG_PATH });

    await expect(store.read()).resolves.toEqual({ repos: [] });
  });

  it("round-trips a written registry through read", async () => {
    const fs = new InMemoryFileSystem();
    const store = new ConfigStore({ fs, configPath: () => CONFIG_PATH });

    await store.write({ repos: [{ path: "/Users/me/project" }] });

    await expect(store.read()).resolves.toEqual({
      repos: [{ path: "/Users/me/project" }],
    });
  });

  it("resolves a lazily-provided config path on each access", async () => {
    const fs = new InMemoryFileSystem();
    let path = "/home/me/.maestro/config.json";
    const store = new ConfigStore({ fs, configPath: () => path });

    await store.write({ repos: [{ path: "/Users/me/project" }] });
    path = "/sandbox/.maestro/config.json";

    await expect(store.read()).resolves.toEqual({ repos: [] });
  });

  it("throws a blocking error on unparseable JSON rather than reading empty", async () => {
    const fs = new InMemoryFileSystem({
      files: { [CONFIG_PATH]: "{ not json" },
    });
    const store = new ConfigStore({ fs, configPath: () => CONFIG_PATH });

    await expect(store.read()).rejects.toThrow("is not valid JSON.");
  });

  it("throws a blocking error when the config shape is invalid", async () => {
    const fs = new InMemoryFileSystem({
      files: { [CONFIG_PATH]: JSON.stringify({ repos: "not-an-array" }) },
    });
    const store = new ConfigStore({ fs, configPath: () => CONFIG_PATH });

    await expect(store.read()).rejects.toThrow(
      "does not match the expected shape.",
    );
  });

  const operation = (tools: string[]) => ({
    key: "repo:/Users/me/project",
    target: { kind: "repo", repoPath: "/Users/me/project" },
    harness: "fimoklei/agent-harness",
    kind: "deploy",
    release: "v1.0.0",
    previous: [],
    desired: ["tdd"],
    tools,
    startedAt: "2026-11-24T10:00:00.000Z",
  });
  const readOperation = (tools: string[]) =>
    new ConfigStore({
      fs: new InMemoryFileSystem({
        files: {
          [CONFIG_PATH]: JSON.stringify({
            repos: [],
            targetOperations: [operation(tools)],
          }),
        },
      }),
      configPath: () => CONFIG_PATH,
    }).read();

  it("keeps an operation record naming Claude Code and Codex", async () => {
    await expect(readOperation(["claude", "codex"])).resolves.toEqual({
      repos: [],
      targetOperations: [operation(["claude", "codex"])],
    });
  });

  it("drops an operation record naming an unknown tool", async () => {
    await expect(readOperation(["cursor"])).resolves.toEqual({ repos: [] });
  });

  it("reads a fetch time that is not a real moment as no record at all", async () => {
    const fs = new InMemoryFileSystem({
      files: {
        [CONFIG_PATH]: JSON.stringify({
          repos: [],
          harnessFreshness: {
            root: "/home/me/agent-harness",
            outcome: "fetched",
            lastFetchedAt: "yesterday-ish",
          },
        }),
      },
    });
    const store = new ConfigStore({ fs, configPath: () => CONFIG_PATH });

    await expect(store.read()).resolves.toEqual({ repos: [] });
  });

  it("keeps the registry readable when an older freshness record is on disk", async () => {
    const fs = new InMemoryFileSystem({
      files: {
        [CONFIG_PATH]: JSON.stringify({
          repos: [{ path: "/Users/me/project" }],
          harnessFreshness: { outcome: "fetched", lastFetchedAt: null },
        }),
      },
    });
    const store = new ConfigStore({ fs, configPath: () => CONFIG_PATH });

    await expect(store.read()).resolves.toEqual({
      repos: [{ path: "/Users/me/project" }],
    });
  });

  it("lets one update finish before the next reads, so neither is lost", async () => {
    const fs = new InMemoryFileSystem();
    const store = new ConfigStore({ fs, configPath: () => CONFIG_PATH });

    await Promise.all([
      store.update((config) => ({
        config: { ...config, repos: [{ path: "/Users/me/project" }] },
      })),
      store.update((config) => ({
        config: { ...config, inventoryPath: "/Users/me/agent-harness" },
      })),
    ]);

    await expect(store.read()).resolves.toEqual({
      repos: [{ path: "/Users/me/project" }],
      inventoryPath: "/Users/me/agent-harness",
    });
  });

  it("skips the write when an update decides there is nothing to change", async () => {
    const fs = new InMemoryFileSystem();
    const store = new ConfigStore({ fs, configPath: () => CONFIG_PATH });
    await store.write({ repos: [{ path: "/Users/me/project" }] });

    const refused = await store.update(() => ({ result: "refused" as const }));

    expect(refused).toBe("refused");
    await expect(store.read()).resolves.toEqual({
      repos: [{ path: "/Users/me/project" }],
    });
  });

  it("re-reads a config that changed on disk since the last read", async () => {
    const fs = new InMemoryFileSystem({
      files: { [CONFIG_PATH]: JSON.stringify({ repos: [] }) },
    });
    const store = new ConfigStore({ fs, configPath: () => CONFIG_PATH });
    await store.read();

    await fs.writeFile(
      CONFIG_PATH,
      JSON.stringify({ repos: [{ path: "/Users/me/project" }] }),
    );

    await expect(store.read()).resolves.toEqual({
      repos: [{ path: "/Users/me/project" }],
    });
  });

  it("answers an unchanged config without reading the file again", async () => {
    const fs = new InMemoryFileSystem({
      files: {
        [CONFIG_PATH]: JSON.stringify({ repos: [{ path: "/Users/me/a" }] }),
      },
    });
    const store = new ConfigStore({ fs, configPath: () => CONFIG_PATH });
    await store.read();
    const readFile = vi.spyOn(fs, "readFile");

    const again = await store.read();

    expect(again).toEqual({ repos: [{ path: "/Users/me/a" }] });
    expect(readFile).not.toHaveBeenCalled();
  });

  it("still fails when a valid config is replaced by an invalid one", async () => {
    const fs = new InMemoryFileSystem({
      files: { [CONFIG_PATH]: JSON.stringify({ repos: [] }) },
    });
    const store = new ConfigStore({ fs, configPath: () => CONFIG_PATH });
    await store.read();

    await fs.writeFile(CONFIG_PATH, "{ not json");

    await expect(store.read()).rejects.toThrow("is not valid JSON.");
  });

  it("shows a write through the store on the next read", async () => {
    const fs = new InMemoryFileSystem({
      files: { [CONFIG_PATH]: JSON.stringify({ repos: [] }) },
    });
    const store = new ConfigStore({ fs, configPath: () => CONFIG_PATH });
    await store.read();

    await store.update((config) => ({
      config: { ...config, inventoryPath: "/Users/me/agent-harness" },
    }));

    await expect(store.read()).resolves.toEqual({
      repos: [],
      inventoryPath: "/Users/me/agent-harness",
    });
  });

  it("never lets a caller's change to a returned config leak into the next read", async () => {
    const fs = new InMemoryFileSystem({
      files: { [CONFIG_PATH]: JSON.stringify({ repos: [] }) },
    });
    const store = new ConfigStore({ fs, configPath: () => CONFIG_PATH });

    (await store.read()).repos.push({ path: "/Users/me/stray" });

    await expect(store.read()).resolves.toEqual({ repos: [] });
  });

  it("never lets a caller's change to a remembered config leak into the next read", async () => {
    const fs = new InMemoryFileSystem({
      files: { [CONFIG_PATH]: JSON.stringify({ repos: [] }) },
    });
    const store = new ConfigStore({ fs, configPath: () => CONFIG_PATH });
    await store.read();

    (await store.read()).repos.push({ path: "/Users/me/stray" });

    await expect(store.read()).resolves.toEqual({ repos: [] });
  });

  it("runs the next update after one that rejects", async () => {
    const store = new ConfigStore({
      fs: new InMemoryFileSystem(),
      configPath: () => CONFIG_PATH,
    });

    await expect(
      store.update(() => {
        throw new Error("refused");
      }),
    ).rejects.toThrow("refused");

    await expect(store.update(() => ({ result: "ran" }))).resolves.toBe("ran");
  });
});
