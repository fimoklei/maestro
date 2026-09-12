import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type DeployedContentState,
  GlobalDeployStateReader,
  InFlightLocks,
  InventoryReader,
  LocalCopyGuard,
  NodeFileSystem,
  TargetSelectionAdapter,
  UpdateTarget,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { realRegistry } from "../helpers/real-registry";
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

// The preview journey for an Update: a real registry, a real root-package
// lockfile and real files on disk, priced against a Harness whose releases the
// test controls. It writes nothing — the confirm is #954.

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

describe("update preflight HTTP route", () => {
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

  async function makeApp(options?: { copy?: DeployedContentState }) {
    const fs = new NodeFileSystem();
    const registry = realRegistry(fs, join(home, "config.json"));
    const inventory = new InventoryReader({
      fs,
      resolvePath: () => undefined,
      readReleasedSkills: async () => [],
    });
    const locks = new InFlightLocks();
    const deployState = new GlobalDeployStateReader({
      fs,
      toolPresence: { detectGlobalTools: async () => ["claude"] },
      treeRoot: () => home,
      // The card's own Release head, which is where the release a target
      // follows is read from — production wires the same reader (app.ts).
      releaseHead: {
        read: async ({ release, selection }) => ({
          release,
          latestRelease: "v0.3.4",
          changed: null,
          selected: selection.length,
          comparedAt: null,
        }),
      },
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
        targetSelection: new TargetSelectionAdapter({
          deployState,
          globalRoot: () => join(home, ".apm"),
        }),
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
          content: { classify: async () => options?.copy ?? "clean" },
        }),
      }),
      enforceOriginHost: false,
    });
    return { app, registry };
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
