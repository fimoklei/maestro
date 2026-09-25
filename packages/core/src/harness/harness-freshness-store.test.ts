import { describe, expect, it } from "vitest";
import { ConfigStore } from "../registry/config-store";
import { InMemoryFileSystem } from "../registry/file-system.fake";
import { HarnessFreshnessStore } from "./harness-freshness-store";

const CONFIG_PATH = "/home/me/.maestro/config.json";
const HARNESS = "/home/me/agent-harness";

// One disk, so a "restart" is a second store over the same files.
function buildStore(fs = new InMemoryFileSystem()) {
  const config = new ConfigStore({ fs, configPath: () => CONFIG_PATH });
  return {
    fs,
    config,
    freshness: new HarnessFreshnessStore({ store: config }),
  };
}

describe("HarnessFreshnessStore", () => {
  it("reads a harness nobody has fetched yet as neither stale nor fresh", async () => {
    const { freshness } = buildStore();

    await expect(freshness.read(HARNESS)).resolves.toEqual({
      outcome: null,
      lastFetchedAt: null,
    });
  });

  it("survives a restart, so a stale picture keeps its age", async () => {
    const first = buildStore();
    await first.freshness.record(HARNESS, {
      outcome: "offline",
      lastFetchedAt: "2026-08-01T07:00:00.000Z",
    });

    const second = buildStore(first.fs);
    await expect(second.freshness.read(HARNESS)).resolves.toEqual({
      outcome: "offline",
      lastFetchedAt: "2026-08-01T07:00:00.000Z",
    });
  });

  it("leaves the rest of the config alone when it records a fetch", async () => {
    const { config, freshness } = buildStore();
    await config.write({
      repos: [{ path: "/home/me/app" }],
      inventoryPath: "/home/me/agent-harness",
    });

    await freshness.record(HARNESS, {
      outcome: "fetched",
      lastFetchedAt: "2026-08-03T09:14:00.000Z",
    });

    await expect(config.read()).resolves.toMatchObject({
      repos: [{ path: "/home/me/app" }],
      inventoryPath: "/home/me/agent-harness",
    });
  });

  it("never attributes one harness's last fetch to another", async () => {
    const { freshness } = buildStore();
    await freshness.record(HARNESS, {
      outcome: "fetched",
      lastFetchedAt: "2026-08-03T09:14:00.000Z",
    });

    await expect(freshness.read("/home/me/other-harness")).resolves.toEqual({
      outcome: null,
      lastFetchedAt: null,
    });
  });
});
