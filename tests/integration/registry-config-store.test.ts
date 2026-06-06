import {
  mkdtemp,
  realpath as nodeRealpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigStore, NodeFileSystem } from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Integration lane: drives the real node:fs adapter against a throwaway temp
// dir, never the real ~/.maestro (J10 acceptance criterion). Proves persistence
// and the realpath/isDirectory checks against an actual filesystem.
describe("registry persistence on a real filesystem", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "maestro-registry-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("persists a registered repo across a fresh ConfigStore (a restart)", async () => {
    const fs = new NodeFileSystem();
    const configPath = join(dir, ".maestro", "config.json");

    const writer = new ConfigStore({ fs, configPath });
    await writer.write({ repos: [{ path: dir }] });

    const reader = new ConfigStore({ fs, configPath });
    await expect(reader.read()).resolves.toEqual({ repos: [{ path: dir }] });
  });

  it("resolves realpath and isDirectory against the real disk", async () => {
    const fs = new NodeFileSystem();
    const filePath = join(dir, "notes.txt");
    await writeFile(filePath, "hello", "utf8");

    await expect(fs.realpath(dir)).resolves.toBe(await nodeRealpath(dir));
    await expect(fs.isDirectory(dir)).resolves.toBe(true);
    await expect(fs.isDirectory(filePath)).resolves.toBe(false);
    await expect(fs.readFile(join(dir, "missing.json"))).resolves.toBeNull();
    await expect(fs.realpath(join(dir, "missing"))).rejects.toThrow();
  });
});
