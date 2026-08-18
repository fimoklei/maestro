import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  GlobalDeployStateReader,
  InFlightLocks,
  InventoryReader,
  NodeFileSystem,
  ToolPresenceAdapter,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { realRegistry } from "../helpers/real-registry";
import { stubBrowse } from "../helpers/stub-browse";
import { stubConnect } from "../helpers/stub-connect";
import { stubDeploy } from "../helpers/stub-deploy";
import { stubDrift } from "../helpers/stub-drift";
import { stubHarness } from "../helpers/stub-harness";
import { stubImport } from "../helpers/stub-import";
import { stubPromotes } from "../helpers/stub-promote";
import { stubPublish } from "../helpers/stub-publish";
import { stubRemove } from "../helpers/stub-remove";
import { stubScaffold } from "../helpers/stub-scaffold";

// Integration lane for global (user-scope) deploy-state, now grouped per detected
// tool (ADR-0011, J03). The server resolves the user-scope location itself — no
// client-supplied path crosses the boundary — so the route takes no query. Both
// the lockfile root and tool-presence detection point at a sandbox HOME, so this
// test never reads the real ~/.apm or the real ~/.claude.json (apm-driver.md
// safety note). Presence is the real filesystem adapter: seeding a tool's config
// marker under the sandbox HOME is what makes it "detected".
const SINGLE_TOOL_LOCKFILE = readFileSync(
  new URL("../fixtures/apm.lock.global-single-tool.yaml", import.meta.url),
  "utf8",
);
const TWO_TOOL_LOCKFILE = readFileSync(
  new URL("../fixtures/apm.lock.global-two-tool.yaml", import.meta.url),
  "utf8",
);

type ToolDeployState = {
  tool: string;
  primitives: { type: string; name: string; version: string }[];
};

describe("global deploy-state HTTP route (per detected tool)", () => {
  let home: string;
  let apmRoot: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "maestro-global-"));
    apmRoot = join(home, ".apm");
    await mkdir(apmRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  // Seeds a tool's deploy-immune presence marker under the sandbox HOME so the
  // real ToolPresenceAdapter detects it (spike #127).
  async function installClaude() {
    await writeFile(join(home, ".claude.json"), "{}", "utf8");
  }
  async function installCodex() {
    await mkdir(join(home, ".codex"), { recursive: true });
    await writeFile(join(home, ".codex", "config.toml"), "", "utf8");
  }

  function makeApp() {
    const fs = new NodeFileSystem();
    const registry = realRegistry(fs, join(home, "config.json"));
    const inventory = new InventoryReader({ fs, resolvePath: () => undefined });
    const deployState = new GlobalDeployStateReader({
      fs,
      toolPresence: new ToolPresenceAdapter({ homeRoot: () => home }),
    });
    const locks = new InFlightLocks();
    return createApp({
      importSkill: stubImport(),
      registry,
      inventory,
      deployState,
      deploy: stubDeploy({ inventory, registry, locks }),
      remove: stubRemove({ registry, locks }),
      drift: stubDrift({ registry }),
      resolveGlobalRoot: () => apmRoot,
      harness: stubHarness(),
      publish: stubPublish(),
      ...stubPromotes(),
      connect: stubConnect(),
      scaffold: stubScaffold(),
      browse: stubBrowse(),
      enforceOriginHost: false,
    });
  }

  it("groups a single-tool install under only the detected tool", async () => {
    await installClaude();
    await writeFile(
      join(apmRoot, "apm.lock.yaml"),
      SINGLE_TOOL_LOCKFILE,
      "utf8",
    );

    const res = await makeApp().request("/api/deploy-state/global");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      tools: [
        {
          tool: "claude",
          primitives: [{ type: "skill", name: "tdd", version: "v0.5.1" }],
        },
      ],
      skipped: [],
    });
  });

  it("attributes a two-tool install to both detected tools", async () => {
    await installClaude();
    await installCodex();
    await writeFile(join(apmRoot, "apm.lock.yaml"), TWO_TOOL_LOCKFILE, "utf8");

    const res = await makeApp().request("/api/deploy-state/global");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { tools: ToolDeployState[] };
    expect(body.tools).toEqual([
      {
        tool: "claude",
        primitives: [{ type: "skill", name: "tdd", version: "v0.5.1" }],
      },
      {
        tool: "codex",
        primitives: [{ type: "skill", name: "tdd", version: "v0.5.1" }],
      },
    ]);
  });

  it("lists a detected tool with nothing deployed as an empty group", async () => {
    // Codex is present; a claude-only install must not back-fill under it.
    await installClaude();
    await installCodex();
    await writeFile(
      join(apmRoot, "apm.lock.yaml"),
      SINGLE_TOOL_LOCKFILE,
      "utf8",
    );

    const res = await makeApp().request("/api/deploy-state/global");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      tools: [
        {
          tool: "claude",
          primitives: [{ type: "skill", name: "tdd", version: "v0.5.1" }],
        },
        { tool: "codex", primitives: [] },
      ],
      skipped: [],
    });
  });

  it("shows each detected tool an empty group when nothing is deployed globally", async () => {
    // No global apm.lock.yaml: an honest empty state per detected tool, not an error.
    await installClaude();

    const res = await makeApp().request("/api/deploy-state/global");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      tools: [{ tool: "claude", primitives: [] }],
      skipped: [],
    });
  });

  it("surfaces a visible error for a malformed global lockfile", async () => {
    await installClaude();
    await writeFile(
      join(apmRoot, "apm.lock.yaml"),
      "dependencies: not-a-list\n",
      "utf8",
    );

    const res = await makeApp().request("/api/deploy-state/global");

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("malformed");
    expect(body.message).toMatch(/\S/);
  });

  it("takes no client-supplied path: a repo query cannot redirect the global read", async () => {
    await installClaude();
    await writeFile(
      join(apmRoot, "apm.lock.yaml"),
      SINGLE_TOOL_LOCKFILE,
      "utf8",
    );

    const res = await makeApp().request(
      "/api/deploy-state/global?repo=/etc/passwd",
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      tools: [
        {
          tool: "claude",
          primitives: [{ type: "skill", name: "tdd", version: "v0.5.1" }],
        },
      ],
      skipped: [],
    });
  });
});
