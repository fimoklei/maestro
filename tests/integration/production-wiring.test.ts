import { readFileSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  realpath as nodeRealpath,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeRepoDir } from "../helpers/repo-dir";

// The default `app` must resolve MAESTRO_HOME when a request arrives, not freeze
// it at import time. Otherwise any test or tool importing { app } and POSTing
// would write to the real ~/.maestro regardless of a sandbox set later. Here we
// set MAESTRO_HOME after the module is already imported and prove the write
// lands in the sandbox (see .claude/rules/security.md).
const LOCAL = {
  "content-type": "application/json",
  host: "127.0.0.1:3000",
  origin: "http://127.0.0.1:3000",
};

describe("default app config home", () => {
  let dir: string;
  const previousHome = process.env.MAESTRO_HOME;

  beforeEach(async () => {
    dir = await makeRepoDir("maestro-home-");
    process.env.MAESTRO_HOME = dir;
  });

  afterEach(async () => {
    process.env.MAESTRO_HOME = previousHome;
    await rm(dir, { recursive: true, force: true });
  });

  it("writes to the MAESTRO_HOME set after import, not a frozen path", async () => {
    const res = await app.request("/api/registry/repos", {
      method: "POST",
      headers: LOCAL,
      body: JSON.stringify({ path: dir }),
    });

    expect(res.status).toBe(201);
    const written = await readFile(join(dir, "config.json"), "utf8");
    expect(JSON.parse(written).repos).toHaveLength(1);
  });
});

// The production dependency factory wires five interchangeable async thunks —
// config path, central inventory path, inventory path, browse ceiling, global
// apm root. Their types are mutually assignable, so a mis-wiring compiles.
// Every root below is a distinct sandbox directory, so each route can only
// answer correctly through its own closure. HOME is sandboxed alongside
// MAESTRO_HOME because the last two routes read the home directory and ~/.apm
// (LEARNINGS · spike-isolation).
const GLOBAL_LOCKFILE = readFileSync(
  new URL("../fixtures/apm.lock.global-single-tool.yaml", import.meta.url),
  "utf8",
);

describe("production wiring", () => {
  let root: string;
  let home: string;
  let maestroHome: string;
  let inventory: string;
  const previous = {
    HOME: process.env.HOME,
    MAESTRO_HOME: process.env.MAESTRO_HOME,
  };

  beforeEach(async () => {
    root = await nodeRealpath(await mkdtemp(join(tmpdir(), "maestro-wiring-")));
    home = join(root, "home");
    maestroHome = join(root, "maestro-home");
    inventory = join(root, "inventory");

    // The browse ceiling, the global apm root and the tool-presence probe all
    // hang off this one sandbox home.
    await mkdir(join(home, "projects"), { recursive: true });
    await mkdir(join(home, ".apm"), { recursive: true });
    await writeFile(join(home, ".claude.json"), "{}", "utf8");
    await writeFile(
      join(home, ".apm", "apm.lock.yaml"),
      GLOBAL_LOCKFILE,
      "utf8",
    );

    await mkdir(join(inventory, ".apm", "skills", "tdd"), { recursive: true });
    await writeFile(
      join(inventory, ".apm", "skills", "tdd", "SKILL.md"),
      "---\nname: tdd\ndescription: Test-driven development loop\n---\n",
      "utf8",
    );

    await mkdir(maestroHome);
    await writeFile(
      join(maestroHome, "config.json"),
      JSON.stringify({ repos: [], inventoryPath: inventory }),
      "utf8",
    );

    process.env.HOME = home;
    process.env.MAESTRO_HOME = maestroHome;
  });

  afterEach(async () => {
    process.env.HOME = previous.HOME;
    process.env.MAESTRO_HOME = previous.MAESTRO_HOME;
    await rm(root, { recursive: true, force: true });
  });

  it("refuses to register the central inventory as a consuming repo", async () => {
    const res = await app.request("/api/registry/repos", {
      method: "POST",
      headers: LOCAL,
      body: JSON.stringify({ path: inventory }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "central-inventory" });
  });

  it("reports the configured local clone when its GitHub repository is not read", async () => {
    const res = await app.request("/api/inventory/config");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      inventoryPath: inventory,
      githubRepository: null,
    });
  });

  // realDeps wires Inventory to the latest release, so a skill sitting only in
  // the working tree is never listed and the unread release is never a count of
  // zero (#841). The configured path itself is proved by the config route above;
  // the positive listing over a real release is proved in the git lane.
  it("never lists a skill the configured path holds outside a release", async () => {
    const res = await app.request("/api/inventory/primitives");

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unreadable" });
  });

  it("browses the home directory as the picker's ceiling", async () => {
    const res = await app.request("/api/filesystem/children", {
      method: "POST",
      headers: LOCAL,
      body: JSON.stringify({ path: home }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      path: string;
      parent?: string;
      entries: { name: string }[];
    };
    expect(body.path).toBe(home);
    // Absent `parent` is the "up is disabled" contract: this is the ceiling.
    expect(body.parent).toBeUndefined();
    expect(body.entries.map((entry) => entry.name)).toContain("projects");
  });

  it("reads the global deploy-state from the home apm root", async () => {
    const res = await app.request("/api/deploy-state/global");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      tools: [
        {
          tool: "claude",
          primitives: [{ type: "skill", name: "tdd", version: "v0.5.1" }],
        },
      ],
      skipped: [],
      otherOrigins: [],
    });
  });
});
