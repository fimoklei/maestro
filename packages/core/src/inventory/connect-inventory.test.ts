import { describe, expect, it } from "vitest";
import { ConfigStore } from "../registry/config-store";
import { InMemoryFileSystem } from "../registry/file-system.fake";
import { ConnectInventory } from "./connect-inventory";

const CONFIG_PATH = "/home/me/.maestro/config.json";
const PARSEABLE_ORIGIN = "git@github.com:fimoklei/agent-harness.git";

function makeConnect(
  fs: InMemoryFileSystem,
  originUrl: string | null = PARSEABLE_ORIGIN,
): ConnectInventory {
  return new ConnectInventory({
    fs,
    store: new ConfigStore({ fs, configPath: () => CONFIG_PATH }),
    originUrl: async () => originUrl,
  });
}

// A Harness is recognised by its apm.yml manifest — never by a skills/ dir.
function harnessSeed() {
  return {
    directories: { "/Users/me/agent-harness": "/Users/me/agent-harness" },
    files: { "/Users/me/agent-harness/apm.yml": "dependencies: []\n" },
  };
}

describe("ConnectInventory", () => {
  it("persists inventoryPath for a clone carrying an apm.yml manifest", async () => {
    const fs = new InMemoryFileSystem(harnessSeed());
    const connect = makeConnect(fs);

    const result = await connect.connect("/Users/me/agent-harness");

    expect(result).toEqual({
      ok: true,
      inventoryPath: "/Users/me/agent-harness",
    });
    const stored = await new ConfigStore({
      fs,
      configPath: () => CONFIG_PATH,
    }).read();
    expect(stored.inventoryPath).toBe("/Users/me/agent-harness");
  });

  it("rejects a directory without an apm.yml manifest and persists nothing", async () => {
    const fs = new InMemoryFileSystem({
      directories: { "/Users/me/not-harness": "/Users/me/not-harness" },
    });
    const connect = makeConnect(fs);

    const result = await connect.connect("/Users/me/not-harness");

    expect(result).toEqual({ ok: false, error: "not-an-inventory" });
    const stored = await new ConfigStore({
      fs,
      configPath: () => CONFIG_PATH,
    }).read();
    expect(stored.inventoryPath).toBeUndefined();
  });

  it("rejects a directory named apm.yml, which manifests nothing", async () => {
    const fs = new InMemoryFileSystem({
      directories: {
        "/Users/me/odd": "/Users/me/odd",
        "/Users/me/odd/apm.yml": "/Users/me/odd/apm.yml",
      },
    });

    await expect(makeConnect(fs).connect("/Users/me/odd")).resolves.toEqual({
      ok: false,
      error: "not-an-inventory",
    });
  });

  it("rejects the retired root skills/ shape, which is no longer a fallback", async () => {
    const fs = new InMemoryFileSystem({
      directories: {
        "/Users/me/old-harness": "/Users/me/old-harness",
        "/Users/me/old-harness/skills": "/Users/me/old-harness/skills",
      },
    });

    await expect(
      makeConnect(fs).connect("/Users/me/old-harness"),
    ).resolves.toEqual({ ok: false, error: "not-an-inventory" });
  });

  it("rejects a clone without an origin remote as no-usable-origin and persists nothing", async () => {
    const fs = new InMemoryFileSystem(harnessSeed());
    const connect = makeConnect(fs, null);

    const result = await connect.connect("/Users/me/agent-harness");

    expect(result).toEqual({ ok: false, error: "no-usable-origin" });
    const stored = await new ConfigStore({
      fs,
      configPath: () => CONFIG_PATH,
    }).read();
    expect(stored.inventoryPath).toBeUndefined();
  });

  it("rejects a clone whose origin is unparseable as no-usable-origin", async () => {
    const fs = new InMemoryFileSystem(harnessSeed());
    const connect = makeConnect(fs, "/Users/me/some-local-mirror");

    await expect(connect.connect("/Users/me/agent-harness")).resolves.toEqual({
      ok: false,
      error: "no-usable-origin",
    });
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
