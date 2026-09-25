import {
  mkdir,
  mkdtemp,
  realpath as nodeRealpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  InFlightLocks,
  InventoryReader,
  NodeFileSystem,
  type ReleasedSkill,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { realRegistry } from "../helpers/real-registry";
import { stubConnect } from "../helpers/stub-connect";
import { stubDeploy, stubRetryOperation } from "../helpers/stub-deploy";
import { stubDeployState } from "../helpers/stub-deploy-state";
import { stubDrift } from "../helpers/stub-drift";
import { stubFolderChooser } from "../helpers/stub-folder-chooser";
import { stubHarness } from "../helpers/stub-harness";
import { stubImport } from "../helpers/stub-import";
import { stubPromotes } from "../helpers/stub-promote";
import { stubPublish } from "../helpers/stub-publish";
import { stubRemove } from "../helpers/stub-remove";
import { stubScaffold } from "../helpers/stub-scaffold";
import { stubUpdate } from "../helpers/stub-update";

describe("inventory HTTP route", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "maestro-inventory-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const skillManifest = (name: string, description: string) =>
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`;

  async function writeSkill(name: string, description: string) {
    const skillDir = join(dir, ".apm", "skills", name);
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
      "utf8",
    );
  }

  // Null is an unreadable release; the skills on disk are never its source.
  function makeApp(
    inventoryPath: string | undefined,
    {
      originUrl = null,
      released = [],
    }: { originUrl?: string | null; released?: ReleasedSkill[] | null } = {},
  ) {
    const fs = new NodeFileSystem();
    const registry = realRegistry(fs, join(dir, "config.json"));
    const inventory = new InventoryReader({
      fs,
      resolvePath: () => inventoryPath,
      originUrl: () => originUrl,
      readReleasedSkills: async () => released,
    });
    const deployState = stubDeployState({ fs });
    const locks = new InFlightLocks();
    return createApp({
      importSkill: stubImport(),
      registry,
      inventory,
      deployState,
      deploy: stubDeploy({ inventory, registry, locks }),
      remove: stubRemove({ registry, locks }),
      retryOperation: stubRetryOperation({ registry, locks }),
      drift: stubDrift({ registry }),
      resolveGlobalRoot: () => "/nonexistent-apm-root",
      harness: stubHarness(),
      publish: stubPublish(),
      ...stubPromotes(),
      connect: stubConnect(),
      scaffold: stubScaffold(),
      folderChooser: stubFolderChooser(),
      update: stubUpdate(),
      enforceOriginHost: false,
    });
  }

  it("GET /api/inventory/primitives lists the released skills", async () => {
    const app = makeApp(dir, {
      released: [
        {
          name: "tdd",
          manifest: skillManifest("tdd", "Test-driven development loop"),
        },
      ],
    });

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

  it("skips a skill with no frontmatter without hiding the valid ones", async () => {
    const app = makeApp(dir, {
      released: [
        { name: "broken", manifest: "# broken\nno frontmatter\n" },
        {
          name: "tdd",
          manifest: skillManifest("tdd", "Test-driven development loop"),
        },
      ],
    });

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

  it("returns 409 with its own code when no inventory is configured", async () => {
    const app = makeApp(undefined);

    const res = await app.request("/api/inventory/primitives");

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("not-configured");
    // The path is never echoed back: it may be a misconfigured secret.
    expect(JSON.stringify(body)).not.toContain(dir);
  });

  it("returns 503 with its own code when the release cannot be read", async () => {
    const app = makeApp(dir, { released: null });

    const res = await app.request("/api/inventory/primitives");

    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("unreadable");
    expect(JSON.stringify(body)).not.toContain(dir);
  });

  // Local disk content alone no longer justifies a positive count (#841).
  it("lists nothing when a skill is only in the working tree", async () => {
    await writeSkill("tdd", "Test-driven development loop");
    const app = makeApp(dir, { released: [] });

    const res = await app.request("/api/inventory/primitives");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ primitives: [] });
  });

  it("GET /api/inventory/config returns the local clone and GitHub repository", async () => {
    const app = makeApp(dir, {
      originUrl: "git@github.com:fimoklei/agent-harness.git",
    });

    const res = await app.request("/api/inventory/config");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      inventoryPath: await nodeRealpath(dir),
      githubRepository: "fimoklei/agent-harness",
    });
  });

  it("GET /api/inventory/config keeps the local clone when its GitHub repository is not read", async () => {
    const app = makeApp(dir);

    const res = await app.request("/api/inventory/config");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      inventoryPath: await nodeRealpath(dir),
      githubRepository: null,
    });
  });

  it("GET /api/inventory/config returns null when no inventory is configured", async () => {
    const app = makeApp(undefined);

    const res = await app.request("/api/inventory/config");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      inventoryPath: null,
      githubRepository: null,
    });
  });
});
