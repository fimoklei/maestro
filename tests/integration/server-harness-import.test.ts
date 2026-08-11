import {
  link,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CopySkillFolder,
  ImportSkill,
  InFlightLocks,
  InventoryReader,
  NodeCopyTreeFs,
  NodeFileSystem,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { realRegistry } from "../helpers/real-registry";
import { stubBrowse } from "../helpers/stub-browse";
import { stubConnect } from "../helpers/stub-connect";
import { stubDeploy } from "../helpers/stub-deploy";
import { stubDeployState } from "../helpers/stub-deploy-state";
import { stubDrift } from "../helpers/stub-drift";
import { stubHarness } from "../helpers/stub-harness";
import { stubPublish } from "../helpers/stub-publish";
import { stubRemove } from "../helpers/stub-remove";
import { stubScaffold } from "../helpers/stub-scaffold";

// Integration lane: the whole import journey through the HTTP route against a
// real disk — what lands in the Working harness, what is skipped, and what is
// refused before anything is written (#576).
describe("harness import HTTP route", () => {
  let base: string;
  let harnessRoot: string;
  let source: string;

  const manifest = (description = "Reviews code.") =>
    `---\nname: whatever-the-author-called-it\ndescription: ${description}\n---\n\nBody.\n`;

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "maestro-import-"));
    harnessRoot = join(base, "harness");
    source = join(base, "Code Review");
    await mkdir(join(harnessRoot, ".apm", "skills"), { recursive: true });
    await mkdir(join(source, "references"), { recursive: true });
    await mkdir(join(source, ".git", "objects"), { recursive: true });
    await writeFile(join(source, "SKILL.md"), manifest(), "utf8");
    await writeFile(join(source, "references", "notes.md"), "notes\n", "utf8");
    await writeFile(join(source, "run.sh"), "#!/bin/sh\n", { mode: 0o755 });
    await writeFile(join(source, ".git", "objects", "blob"), "x", "utf8");
  });

  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  function makeApp(deployedRoots: string[] = []) {
    const fs = new NodeFileSystem();
    const registry = realRegistry(fs, join(base, "config.json"));
    const inventory = new InventoryReader({
      fs,
      resolvePath: () => harnessRoot,
    });
    const locks = new InFlightLocks();
    return createApp({
      registry,
      inventory,
      importSkill: new ImportSkill({
        resolveRoot: async () => fs.realpath(harnessRoot),
        fs,
        homeRoot: () => base,
        copy: new CopySkillFolder({ fs: new NodeCopyTreeFs() }),
        deployedRoots: async () => deployedRoots,
      }),
      harness: stubHarness(),
      publish: stubPublish(),
      connect: stubConnect(),
      scaffold: stubScaffold(),
      deployState: stubDeployState({ fs }),
      deploy: stubDeploy({ inventory, registry, locks }),
      remove: stubRemove({ registry, locks }),
      drift: stubDrift({ registry }),
      resolveGlobalRoot: () => "/nonexistent-apm-root",
      browse: stubBrowse(),
      enforceOriginHost: false,
    });
  }

  const post = (app: ReturnType<typeof makeApp>, path: string, body: unknown) =>
    app.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const check = (app: ReturnType<typeof makeApp>, body: unknown) =>
    post(app, "/api/harness/import/check", body);

  const importSkill = (app: ReturnType<typeof makeApp>, body: unknown) =>
    post(app, "/api/harness/import", body);

  it("copies nested content and the executable bit, and skips .git", async () => {
    const app = makeApp();

    const response = await importSkill(app, { source });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: "code-review" });
    const landed = join(harnessRoot, ".apm", "skills", "code-review");
    expect(await readFile(join(landed, "references", "notes.md"), "utf8")).toBe(
      "notes\n",
    );
    expect((await stat(join(landed, "run.sh"))).mode & 0o111).not.toBe(0);
    await expect(stat(join(landed, ".git"))).rejects.toThrow();
  });

  it("rewrites the copied manifest's name to the directory name", async () => {
    const app = makeApp();

    await importSkill(app, { source, name: "reviewer" });

    const landed = join(harnessRoot, ".apm", "skills", "reviewer", "SKILL.md");
    expect(await readFile(landed, "utf8")).toContain("name: reviewer");
  });

  it("proposes a slug and reports the conventions without refusing", async () => {
    await writeFile(
      join(source, "SKILL.md"),
      `${manifest("d".repeat(1025))}${"line\n".repeat(500)}`,
      "utf8",
    );
    const app = makeApp();

    const response = await check(app, { source });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      name: "code-review",
      sourceBlocker: null,
      nameBlocker: null,
      advisories: ["long-manifest", "long-description"],
    });
  });

  it("reports a name the harness already holds on the name field", async () => {
    await mkdir(join(harnessRoot, ".apm", "skills", "code-review"), {
      recursive: true,
    });
    const app = makeApp();

    const response = await check(app, { source });

    expect(await response.json()).toMatchObject({
      sourceBlocker: null,
      nameBlocker: "name-taken",
    });
  });

  it("refuses a source with no SKILL.md, leaving the harness untouched", async () => {
    await rm(join(source, "SKILL.md"));
    const app = makeApp();

    const response = await importSkill(app, { source });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: "missing-manifest" });
    await expect(
      stat(join(harnessRoot, ".apm", "skills", "code-review")),
    ).rejects.toThrow();
  });

  it("refuses a copy Maestro deployed to a registered target", async () => {
    const repo = join(base, "repo");
    const deployed = join(repo, ".claude", "skills", "code-review");
    await mkdir(deployed, { recursive: true });
    await writeFile(join(deployed, "SKILL.md"), manifest(), "utf8");
    const app = makeApp([repo]);

    const response = await importSkill(app, { source: deployed });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "deployed-copy" });
  });

  it("refuses a folder outside the ceiling the picker browses", async () => {
    const app = makeApp();

    const response = await importSkill(app, { source: "/etc" });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "outside-root" });
  });

  it("leaves nothing behind when the copy is refused mid-tree", async () => {
    // A hard-linked file is refused, and it sits beside files the walk already
    // planned: neither the destination nor a staging leftover may appear.
    await writeFile(join(source, "shared.bin"), "shared");
    await link(join(source, "shared.bin"), join(source, "shared-alias.bin"));
    const app = makeApp();

    const response = await importSkill(app, { source });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: "hard-linked-file" });
    expect(await readdir(join(harnessRoot, ".apm", "skills"))).toEqual([]);
  });
});
