import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ConfigStore,
  DeployStateReader,
  InventoryReader,
  NodeFileSystem,
  Registry,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stubConnect } from "../helpers/stub-connect";
import { stubDeploy } from "../helpers/stub-deploy";
import { stubDrift } from "../helpers/stub-drift";

// Integration lane: drives the real Hono app via app.request against a real
// agent-harness-shaped clone on a temp dir. The Origin/Host guard is disabled
// (its enforcement lives in server-security.test.ts).
describe("inventory HTTP route", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "maestro-inventory-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function writeSkill(name: string, description: string) {
    const skillDir = join(dir, "skills", name);
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
      "utf8",
    );
  }

  function makeApp(inventoryPath: string | undefined) {
    const fs = new NodeFileSystem();
    const registry = new Registry({
      fs,
      store: new ConfigStore({ fs, configPath: join(dir, "config.json") }),
    });
    const inventory = new InventoryReader({
      fs,
      resolvePath: () => inventoryPath,
    });
    const deployState = new DeployStateReader({ fs });
    return createApp({
      registry,
      inventory,
      deployState,
      deploy: stubDeploy({ inventory, registry }),
      drift: stubDrift({ registry }),
      resolveGlobalRoot: () => "/nonexistent-apm-root",
      connect: stubConnect(),
      enforceOriginHost: false,
    });
  }

  it("GET /api/inventory/primitives lists the central skills", async () => {
    await writeSkill("tdd", "Test-driven development loop");
    const app = makeApp(dir);

    const res = await app.request("/api/inventory/primitives");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      primitives: [
        {
          type: "skill",
          name: "tdd",
          description: "Test-driven development loop",
        },
      ],
    });
  });

  it("returns 409 with a readable error when no inventory is configured", async () => {
    const app = makeApp(undefined);

    const res = await app.request("/api/inventory/primitives");

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("not-configured");
    expect(body.message).toMatch(/\S/);
    // The path is never echoed back — it may be a misconfigured secret.
    expect(body.message).not.toContain(dir);
  });
});
