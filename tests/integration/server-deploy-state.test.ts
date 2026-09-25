import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type DeployStateExtras,
  InFlightLocks,
  InventoryReader,
  NodeFileSystem,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { realRegistry } from "../helpers/real-registry";
import { makeRepoDir } from "../helpers/repo-dir";
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

// Integration lane: drives the real Hono app via app.request against real temp
// dirs. The deploy-state route is registry-gated — membership is checked before
// any lockfile is read. The Origin/Host guard is disabled here (its enforcement
// lives in server-security.test.ts).
describe("deploy-state HTTP route", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "maestro-deploy-state-"));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  function makeApp(githubPage?: DeployStateExtras["githubPage"]) {
    const fs = new NodeFileSystem();
    const registry = realRegistry(fs, join(home, "config.json"));
    const inventory = new InventoryReader({
      fs,
      resolvePath: () => undefined,
      readReleasedSkills: async () => [],
    });
    const deployState = stubDeployState({ fs, githubPage });
    const locks = new InFlightLocks();
    const app = createApp({
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
    return { app, registry };
  }

  async function makeRepo(lockfile: string | null): Promise<string> {
    const repo = await makeRepoDir("maestro-repo-");
    if (lockfile !== null) {
      await writeFile(join(repo, "apm.lock.yaml"), lockfile, "utf8");
    }
    return repo;
  }

  const tddLockfile = [
    "lockfile_version: '1'",
    "apm_version: 0.16.0",
    "dependencies:",
    "- repo_url: fimoklei/agent-harness",
    "  host: github.com",
    "  resolved_commit: ec491f154c9d5c9a6c5db56d1946c4c34f3899bb",
    "  resolved_ref: v0.5.0",
    "  virtual_path: .apm/skills/tdd",
    "  is_virtual: true",
    "  package_type: claude_skill",
    "  deployed_files:",
    "  - .claude/skills/tdd",
    "  content_hash: sha256:abc",
    "",
  ].join("\n");

  it("lists deployed skills with their human tag version", async () => {
    const repo = await makeRepo(tddLockfile);
    const { app, registry } = makeApp();
    await registry.register(repo);

    const res = await app.request(
      `/api/deploy-state?repo=${encodeURIComponent(repo)}`,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
      skipped: [],
    });
    await rm(repo, { recursive: true, force: true });
  });

  it("shows an empty list for a registered repo with nothing deployed", async () => {
    const repo = await makeRepo(null);
    const { app, registry } = makeApp();
    await registry.register(repo);

    const res = await app.request(
      `/api/deploy-state?repo=${encodeURIComponent(repo)}`,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ primitives: [], skipped: [] });
    await rm(repo, { recursive: true, force: true });
  });

  it("rejects a repo that is not registered, even when it has a lockfile", async () => {
    // The lockfile exists but the repo was never registered: the gate must
    // refuse before reading it, so the response can never leak its contents.
    const repo = await makeRepo(tddLockfile);
    const { app } = makeApp();

    const res = await app.request(
      `/api/deploy-state?repo=${encodeURIComponent(repo)}`,
    );

    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).not.toContain("v0.5.0");
    await rm(repo, { recursive: true, force: true });
  });

  it("returns 400 when no repo is given", async () => {
    const { app } = makeApp();

    const res = await app.request("/api/deploy-state");

    expect(res.status).toBe(400);
  });

  it("surfaces a visible error for a malformed lockfile", async () => {
    const repo = await makeRepo("dependencies: not-a-list\n");
    const { app, registry } = makeApp();
    await registry.register(repo);

    const res = await app.request(
      `/api/deploy-state?repo=${encodeURIComponent(repo)}`,
    );

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("malformed");
    await rm(repo, { recursive: true, force: true });
  });

  describe("the repository's GitHub page", () => {
    async function readGithub(
      githubPage: DeployStateExtras["githubPage"],
    ): Promise<unknown> {
      const repo = await makeRepo(tddLockfile);
      const { app, registry } = makeApp(githubPage);
      await registry.register(repo);
      const res = await app.request(
        `/api/deploy-state?repo=${encodeURIComponent(repo)}`,
      );
      await rm(repo, { recursive: true, force: true });
      expect(res.status).toBe(200);
      return ((await res.json()) as { github?: unknown }).github;
    }

    it("sends the link beside the rest of the reading", async () => {
      const page = { kind: "link", url: "https://github.com/o/r" } as const;
      expect(await readGithub(async () => page)).toEqual(page);
    });

    it("sends a failed origin read as unknown", async () => {
      expect(
        await readGithub(async () => {
          throw new Error("git unavailable");
        }),
      ).toEqual({ kind: "unknown" });
    });

    it("sends a link that fails the shape check as unknown, never as a link", async () => {
      expect(
        await readGithub(async () => ({
          kind: "link",
          url: "https://evil.example/o/r",
        })),
      ).toEqual({ kind: "unknown" });
    });

    it("sends no key where the repository has no GitHub page", async () => {
      expect(await readGithub(async () => null)).toBeUndefined();
    });
  });
});
