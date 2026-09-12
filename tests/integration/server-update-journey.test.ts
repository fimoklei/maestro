import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DeployedContentAdapter,
  type DeployedContentState,
  InFlightLocks,
  InventoryReader,
  LocalCopyGuard,
  NodeFileSystem,
  UpdateTarget,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { realRegistry } from "../helpers/real-registry";
import {
  manifest,
  rootPackageApm,
  rootPackageLocation,
  rootPackageSelection,
} from "../helpers/root-package-apm";
import { stubBrowse } from "../helpers/stub-browse";
import { stubConnect } from "../helpers/stub-connect";
import { stubDeploy, stubRetryOperation } from "../helpers/stub-deploy";
import { stubDeployState } from "../helpers/stub-deploy-state";
import { stubDrift } from "../helpers/stub-drift";
import { stubHarness } from "../helpers/stub-harness";
import { stubImport } from "../helpers/stub-import";
import { stubPromotes } from "../helpers/stub-promote";
import { stubPublish } from "../helpers/stub-publish";
import { stubRemove } from "../helpers/stub-remove";
import { stubScaffold } from "../helpers/stub-scaffold";

// The Update journey: a real registry, a real root-package lockfile and real
// files on disk, priced against a Harness whose releases the test controls,
// then written through the real Selection lifecycle behind a fake apm that
// moves the manifest, the lockfile and the files the way apm does (#953, #954).

// The shape apm 0.29.0 writes for a root package (fixture
// apm.lock.spike-941-step3d-phantom.yaml).
const rootPackageLockfile = (ref: string, deployedFiles: string[]) =>
  [
    "lockfile_version: '1'",
    "apm_version: 0.29.0",
    "dependencies:",
    "- repo_url: fimoklei/agent-harness",
    "  name: agent-harness",
    "  host: github.com",
    `  resolved_ref: ${ref}`,
    "  package_type: apm_package",
    "  deployed_files:",
    ...deployedFiles.map((file) => `  - ${file}`),
    "",
  ].join("\n");

const TREES: Record<string, { name: string; treeHash: string }[]> = {
  "v0.3.2": [
    { name: "tdd", treeHash: "a" },
    { name: "grill", treeHash: "b" },
    { name: "review", treeHash: "d" },
  ],
  "v0.3.4": [
    { name: "tdd", treeHash: "a2" },
    { name: "grill", treeHash: "b" },
    { name: "wizard", treeHash: "f" },
  ],
};

describe("update HTTP journey", () => {
  let home: string;
  let repo: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "maestro-update-preflight-"));
    repo = join(home, "repo");
    await mkdir(repo, { recursive: true });
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  async function seedTarget(names: string[]) {
    const files = names.map((name) => `.claude/skills/${name}/SKILL.md`);
    for (const file of files) {
      await mkdir(join(repo, file, ".."), { recursive: true });
      await writeFile(join(repo, file), "# skill\n", "utf8");
    }
    await writeFile(
      join(repo, "apm.lock.yaml"),
      rootPackageLockfile("v0.3.2", files),
      "utf8",
    );
  }

  async function makeApp(options?: {
    copy?: DeployedContentState;
    lands?: (skills: readonly string[]) => readonly string[];
  }) {
    const fs = new NodeFileSystem();
    const registry = realRegistry(fs, join(home, "config.json"));
    const inventory = new InventoryReader({
      fs,
      resolvePath: () => undefined,
      readReleasedSkills: async () => [],
    });
    const locks = new InFlightLocks();
    const apm = rootPackageApm({
      globalRoot: join(home, ".apm"),
      ...(options?.lands === undefined ? {} : { lands: options.lands }),
    });
    const selection = rootPackageSelection({
      globalRoot: join(home, ".apm"),
      configPath: join(home, "config.json"),
      apm,
    });
    const app = createApp({
      importSkill: stubImport(),
      registry,
      inventory,
      deployState: stubDeployState({ fs }),
      deploy: stubDeploy({ inventory, registry, locks }),
      remove: stubRemove({ registry, locks }),
      retryOperation: stubRetryOperation({ registry, locks }),
      drift: stubDrift({ registry }),
      resolveGlobalRoot: () => join(home, ".apm"),
      harness: stubHarness(),
      publish: stubPublish(),
      ...stubPromotes(),
      connect: stubConnect(),
      scaffold: stubScaffold(),
      browse: stubBrowse(),
      update: new UpdateTarget({
        registry,
        git: {
          readTags: async () => [
            { name: "v0.3.2", commit: "aaa" },
            { name: "v0.3.4", commit: "bbb" },
          ],
          readSkillTreesAtTag: async (_root, tag) => TREES[tag] ?? null,
        },
        resolveRoot: async () => join(home, "harness"),
        harnessOrigin: async () => ({
          host: "github.com",
          ownerRepo: "fimoklei/agent-harness",
        }),
        toolPresence: { detectGlobalTools: async () => ["claude"] },
        copyGuard: new LocalCopyGuard({
          content: {
            classify: async () => options?.copy ?? "clean",
            contentDigest: async () => null,
          },
        }),
        selection,
        // The outcome is read from the files and the record apm just wrote,
        // never stubbed: that reading is what the ledger states (#954).
        deployedContent: new DeployedContentAdapter({
          location: rootPackageLocation(join(home, ".apm")),
        }),
        canonicalPath: async (path: string) => path,
        locks,
      }),
      enforceOriginHost: false,
    });
    return { app, registry, apm };
  }

  const preflight = (
    app: Awaited<ReturnType<typeof makeApp>>["app"],
    body: unknown,
  ) =>
    app.request("/api/deploy/update/preflight", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("prices the latest release over the target's own deployed skills", async () => {
    const { app, registry } = await makeApp();
    await seedTarget(["tdd", "grill", "review"]);
    await registry.register(repo);

    const response = await preflight(app, {
      target: { kind: "repo", repoPath: repo },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      preview: Record<string, unknown>;
    };
    expect(body.preview).toMatchObject({
      release: "v0.3.2",
      chosenRelease: "v0.3.4",
      counts: { changed: 1, removed: 1, unchanged: 1 },
      changed: [
        {
          name: "tdd",
          url: "https://github.com/fimoklei/agent-harness/tree/v0.3.4/.apm/skills/tdd",
        },
      ],
      removed: ["review"],
      unchanged: ["grill"],
      newInRelease: [
        {
          name: "wizard",
          url: "https://github.com/fimoklei/agent-harness/tree/v0.3.4/.apm/skills/wizard",
        },
      ],
      selection: {
        current: ["tdd", "grill", "review"],
        desired: ["tdd", "grill"],
      },
      copyReceipt: null,
    });
    expect(body.preview.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("names the copies needing consent and the receipt that licenses them", async () => {
    const { app, registry } = await makeApp({ copy: "diverged" });
    await seedTarget(["tdd"]);
    await registry.register(repo);

    const response = await preflight(app, {
      target: { kind: "repo", repoPath: repo },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      preview: { localEdits: unknown; copyReceipt: string };
    };
    expect(body.preview.localEdits).toStrictEqual({
      discard: [{ name: "tdd", tool: null }],
      unverified: [],
    });
    expect(body.preview.copyReceipt).toMatch(/^[0-9a-f]{64}$/);
  });

  // The Inventory's entrance: the same preview, asked to add one skill the
  // target's own release does not hold (#955).
  it("names the requested skill and carries it into the desired Selection", async () => {
    const { app, registry } = await makeApp();
    await seedTarget(["tdd", "grill", "review"]);
    await registry.register(repo);

    const response = await preflight(app, {
      target: { kind: "repo", repoPath: repo },
      add: "wizard",
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      preview: Record<string, unknown>;
    };
    expect(body.preview).toMatchObject({
      addedByThisDeploy: [
        {
          name: "wizard",
          url: "https://github.com/fimoklei/agent-harness/tree/v0.3.4/.apm/skills/wizard",
        },
      ],
      newInRelease: [],
      selection: {
        current: ["tdd", "grill", "review"],
        desired: ["tdd", "grill", "wizard"],
      },
    });
  });

  it("refuses to price a release that does not hold the requested skill", async () => {
    const { app, registry } = await makeApp();
    await seedTarget(["tdd", "grill", "review"]);
    await registry.register(repo);

    const response = await preflight(app, {
      target: { kind: "repo", repoPath: repo },
      add: "review",
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toStrictEqual({
      error: "skill-not-in-release",
    });
  });

  it("refuses a repository the registry does not hold", async () => {
    const { app } = await makeApp();
    await seedTarget(["tdd"]);

    const response = await preflight(app, {
      target: { kind: "repo", repoPath: repo },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toStrictEqual({
      error: "repo-not-registered",
    });
  });

  it("refuses a target that follows no release", async () => {
    const { app, registry } = await makeApp();
    await registry.register(repo);

    const response = await preflight(app, {
      target: { kind: "repo", repoPath: repo },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toStrictEqual({ error: "not-deployed" });
  });

  // The confirm, end to end: the reader's token, the write, and the ledger read
  // back off the files apm left behind.
  async function priced(options?: {
    lands?: (skills: readonly string[]) => readonly string[];
    add?: string;
  }) {
    const made = await makeApp(options ?? {});
    await seedTarget(["tdd", "grill", "review"]);
    await writeFile(
      join(repo, "apm.yml"),
      manifest(["grill", "review", "tdd"]),
      "utf8",
    );
    await made.registry.register(repo);
    const response = await preflight(made.app, {
      target: { kind: "repo", repoPath: repo },
      ...(options?.add === undefined ? {} : { add: options.add }),
    });
    const body = (await response.json()) as { preview: { token: string } };
    return { ...made, token: body.preview.token };
  }

  const update = (
    app: Awaited<ReturnType<typeof makeApp>>["app"],
    body: unknown,
  ) =>
    app.request("/api/deploy/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("moves the target to the chosen release and states what landed", async () => {
    const { app, token } = await priced();

    const response = await update(app, {
      target: { kind: "repo", repoPath: repo },
      token,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({
      release: "v0.3.4",
      outcome: [
        { name: "tdd", tool: null, state: "updated" },
        { name: "grill", tool: null, state: "updated" },
        { name: "review", tool: null, state: "removed" },
      ],
    });
    // The exact Selection, with the name this release dropped gone (ADR-0031).
    expect(await readFile(join(repo, "apm.yml"), "utf8")).toBe(
      manifest(["grill", "tdd"]),
    );
  });

  it("states the skills that did not land and keeps the way out", async () => {
    const { app, token } = await priced({ lands: () => ["tdd"] });

    const response = await update(app, {
      target: { kind: "repo", repoPath: repo },
      token,
    });

    expect(response.status).toBe(502);
    expect(await response.json()).toStrictEqual({
      error: "update-incomplete",
      outcome: [
        { name: "tdd", tool: null, state: "updated" },
        { name: "grill", tool: null, state: "not-updated" },
        { name: "review", tool: null, state: "removed" },
      ],
    });
  });

  it("adopts the release and adds the requested skill in one confirm", async () => {
    const { app, token } = await priced({ add: "wizard" });

    const response = await update(app, {
      target: { kind: "repo", repoPath: repo },
      token,
      add: "wizard",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({
      release: "v0.3.4",
      outcome: [
        { name: "tdd", tool: null, state: "updated" },
        { name: "grill", tool: null, state: "updated" },
        { name: "review", tool: null, state: "removed" },
        { name: "wizard", tool: null, state: "updated" },
      ],
    });
    expect(await readFile(join(repo, "apm.yml"), "utf8")).toBe(
      manifest(["grill", "tdd", "wizard"]),
    );
  });

  it("refuses a confirm naming a skill the preview never priced", async () => {
    const { app, token, apm } = await priced();

    const response = await update(app, {
      target: { kind: "repo", repoPath: repo },
      token,
      add: "wizard",
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toStrictEqual({
      error: "status-out-of-date",
    });
    expect(apm.installs).toStrictEqual([]);
  });

  it("refuses a token nobody minted, leaving the target untouched", async () => {
    const { app, apm } = await priced();

    const response = await update(app, {
      target: { kind: "repo", repoPath: repo },
      token: "0".repeat(64),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toStrictEqual({
      error: "status-out-of-date",
    });
    expect(apm.installs).toStrictEqual([]);
  });

  it("answers a confirm with no token with the server's own request shape", async () => {
    const { app } = await makeApp();

    const response = await update(app, {
      target: { kind: "repo", repoPath: repo },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toStrictEqual({
      error: "invalid-body",
      message:
        "Nothing was updated. Reload the page, then start the update again.",
      detail:
        "The request carries a target and the token the preview answered with.",
    });
  });

  it("answers a body naming no target with the server's own request shape", async () => {
    const { app } = await makeApp();

    const response = await preflight(app, { repoPath: repo });

    expect(response.status).toBe(400);
    expect(await response.json()).toStrictEqual({
      error: "invalid-body",
      message:
        "Nothing was previewed. Reload the page, then start the update again.",
      detail:
        'The request carries a target: { kind: "repo", repoPath } or { kind: "global" }.',
    });
  });
});
