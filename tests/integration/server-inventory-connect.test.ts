import {
  chmod,
  mkdir,
  mkdtemp,
  realpath as nodeRealpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BrowseFilesystem,
  ConfigStore,
  ConnectInventory,
  InventoryReader,
  NodeFileSystem,
  Registry,
  readGitOriginUrl,
  resolveInventoryPath,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initGitClone } from "../helpers/git-fixture";
import { stubDeploy } from "../helpers/stub-deploy";
import { stubDeployState } from "../helpers/stub-deploy-state";
import { stubDrift } from "../helpers/stub-drift";
import { stubRemove } from "../helpers/stub-remove";

// Integration lane: drives the real Hono connect endpoint via app.request,
// backed by a real ConfigStore on a temp dir. The Origin/Host guard is disabled
// here (its enforcement lives in server-security.test.ts).
describe("inventory connect HTTP route", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "maestro-connect-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function makeClone(options?: { origin?: boolean }): Promise<string> {
    const clone = join(dir, "agent-harness");
    await mkdir(join(clone, "skills", "tdd"), { recursive: true });
    await writeFile(
      join(clone, "skills", "tdd", "SKILL.md"),
      "---\nname: tdd\ndescription: Test-driven development loop\n---\n\n# tdd\n",
      "utf8",
    );
    await initGitClone(clone, options);
    return clone;
  }

  function makeApp() {
    const fs = new NodeFileSystem();
    const store = new ConfigStore({ fs, configPath: join(dir, "config.json") });
    const registry = new Registry({ fs, store });
    const inventory = new InventoryReader({
      fs,
      resolvePath: async () => resolveInventoryPath(await store.read(), {}),
    });
    const deployState = stubDeployState({ fs });
    return createApp({
      registry,
      inventory,
      connect: new ConnectInventory({ fs, store, originUrl: readGitOriginUrl }),
      deployState,
      deploy: stubDeploy({ inventory, registry }),
      remove: stubRemove({ registry }),
      drift: stubDrift({ registry }),
      resolveGlobalRoot: () => "/nonexistent-apm-root",
      // The real browser, ceilinged at this test's temp dir rather than the
      // user's home, so a picked path can be handed straight to connect.
      browse: new BrowseFilesystem({ fs, homeRoot: () => dir }),
      enforceOriginHost: false,
    });
  }

  function postConnect(app: ReturnType<typeof makeApp>, body: unknown) {
    return app.request("/api/inventory/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("connects a valid clone and reports the canonical path", async () => {
    const clone = await makeClone();
    const app = makeApp();

    const res = await postConnect(app, { path: clone });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      inventoryPath: await nodeRealpath(clone),
      primitiveCount: 1,
    });
  });

  it("after a successful connect the inventory read lists the central skills", async () => {
    const clone = await makeClone();
    const app = makeApp();

    await postConnect(app, { path: clone });
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

  it("connects a clone picked out of a browse listing", async () => {
    // The picker journey: browse the parent, take the path the listing hands
    // back, connect with exactly that. The two routes are covered apart
    // (server-filesystem.test.ts); this is the seam between them.
    const clone = await makeClone();
    const app = makeApp();

    const browse = await app.request("/api/filesystem/children", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: dir }),
    });
    expect(browse.status).toBe(200);
    const { entries } = (await browse.json()) as {
      entries: { name: string; path: string }[];
    };
    const picked = entries.find((entry) => entry.name === "agent-harness");
    expect(picked?.path).toBe(await nodeRealpath(clone));

    const res = await postConnect(app, { path: picked?.path });

    expect(res.status).toBe(200);
    const primitives = await app.request("/api/inventory/primitives");
    expect(await primitives.json()).toEqual({
      primitives: [
        {
          type: "skill",
          name: "tdd",
          description: "Test-driven development loop",
        },
      ],
    });
  });

  it("rejects a malformed body with a 400", async () => {
    const res = await postConnect(makeApp(), { notPath: 1 });

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "invalid-body",
    );
  });

  it("rejects a directory without skills/ as 422 not-an-inventory", async () => {
    const plain = join(dir, "plain");
    await mkdir(plain, { recursive: true });

    const res = await postConnect(makeApp(), { path: plain });

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("not-an-inventory");
    expect(body.message).toMatch(/\S/);
    expect(body.message).not.toContain(plain);
  });

  it("rejects a skills/ folder without a usable git origin as 422 no-usable-origin", async () => {
    const clone = await makeClone({ origin: false });

    const res = await postConnect(makeApp(), { path: clone });

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("no-usable-origin");
    expect(body.message).toMatch(/\S/);
    expect(body.message).not.toContain(clone);
  });

  it("rejects a relative path with a 400", async () => {
    const res = await postConnect(makeApp(), { path: "./relative" });

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("relative");
  });

  it("still reports success when the persisted path connects but its skills/ becomes unreadable before the count re-read", async () => {
    // stat (isDirectory, what connect checks) only needs +x on the *parent*
    // path components, so a 0o000 skills/ dir still passes connect's own
    // is-an-inventory check; readdir (what the count re-read needs) requires
    // +r on the directory itself and fails. The path is already persisted by
    // the time that second read runs — the response must not turn into a 500
    // for a state change that already succeeded (Codex review finding).
    const clone = await makeClone();
    const skillsDir = join(clone, "skills");
    await chmod(skillsDir, 0o000);
    const app = makeApp();

    try {
      const res = await postConnect(app, { path: clone });

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        inventoryPath: string;
        primitiveCount: number;
      };
      expect(body.inventoryPath).toBe(await nodeRealpath(clone));
      expect(body.primitiveCount).toBe(0);
    } finally {
      await chmod(skillsDir, 0o700);
    }
  });
});
