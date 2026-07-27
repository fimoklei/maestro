import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ConfigStore,
  type DeployedContentState,
  DeployedLocation,
  DeployedRefAdapter,
  type DeployTarget,
  InventoryReader,
  NodeFileSystem,
  Registry,
  RemoveDeployedSkill,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stubBrowse } from "../helpers/stub-browse";
import { stubConnect } from "../helpers/stub-connect";
import { stubDeploy } from "../helpers/stub-deploy";
import { stubDeployState } from "../helpers/stub-deploy-state";
import { stubDrift } from "../helpers/stub-drift";

// Integration lane: the remove route over the real Hono app, a real registry and
// a real lockfile on disk. Only the apm driver is faked — what it is handed is
// the assertion, since the ref is what decides whether apm removes the right
// package or silently nothing. Origin/Host guard enforcement lives in
// server-security.test.ts.
describe("remove HTTP route", () => {
  let home: string;
  let repo: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "maestro-remove-home-"));
    repo = await mkdtemp(join(tmpdir(), "maestro-remove-repo-"));
  });

  afterEach(async () => {
    for (const dir of [home, repo]) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  const lockfileWith = (entries: string[]) =>
    ["lockfile_version: '1'", "dependencies:", ...entries, ""].join("\n");

  const skillEntry = (name: string, tag = "v0.5.1") =>
    [
      "- repo_url: fimoklei/agent-harness",
      "  host: github.com",
      `  resolved_ref: ${tag}`,
      `  virtual_path: skills/${name}`,
      "  package_type: claude_skill",
    ].join("\n");

  function makeApp(options?: {
    removed?: boolean;
    // What the destination guard finds on disk. "clean" by default — the guard
    // itself is covered in the core lane; here it only has to reach the wire.
    deployedState?: DeployedContentState;
  }) {
    const fs = new NodeFileSystem();
    const registry = new Registry({
      fs,
      store: new ConfigStore({ fs, configPath: join(home, "config.json") }),
    });
    const inventory = new InventoryReader({ fs, resolvePath: () => undefined });
    const removeCalls: Array<{ target: DeployTarget; ref: string }> = [];
    const remove = new RemoveDeployedSkill({
      registry,
      deployedRef: new DeployedRefAdapter({
        fs,
        location: new DeployedLocation({}),
      }),
      deployedContent: {
        classify: async () => options?.deployedState ?? "clean",
      },
      apm: {
        removeSkill: async (input) => {
          removeCalls.push(input);
          return (options?.removed ?? true) ? { ok: true } : { ok: false };
        },
      },
      canonicalPath: (path) => fs.realpath(path),
    });
    const app = createApp({
      registry,
      inventory,
      deployState: stubDeployState({ fs }),
      deploy: stubDeploy({ inventory, registry }),
      remove,
      drift: stubDrift({ registry }),
      resolveGlobalRoot: () => join(home, "apm"),
      connect: stubConnect(),
      browse: stubBrowse(),
      enforceOriginHost: false,
    });
    return { app, registry, removeCalls };
  }

  const removeRequest = (
    app: ReturnType<typeof makeApp>["app"],
    body: unknown,
  ) =>
    app.request("/api/deploy/remove", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  const removeTdd = (
    app: ReturnType<typeof makeApp>["app"],
    repoPath: string,
  ) =>
    removeRequest(app, {
      type: "skill",
      name: "tdd",
      target: { kind: "repo", repoPath },
    });

  it("removes a deployed skill with the ref its lockfile records", async () => {
    const { app, registry, removeCalls } = makeApp();
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([skillEntry("tdd")]),
      "utf8",
    );
    await registry.register(repo);

    const response = await removeTdd(app, repo);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      removed: { type: "skill", name: "tdd" },
    });
    expect(removeCalls).toEqual([
      {
        target: { kind: "repo", repoPath: repo },
        ref: "github.com/fimoklei/agent-harness/skills/tdd#v0.5.1",
      },
    ]);
  });

  it("refuses a repo outside the registry before apm or the lockfile is touched", async () => {
    const { app, removeCalls } = makeApp();
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([skillEntry("tdd")]),
      "utf8",
    );

    const response = await removeTdd(app, repo);

    expect(response.status).toBe(403);
    expect(removeCalls).toEqual([]);
    // Nothing about the unregistered repo's lockfile leaks back.
    expect(JSON.stringify(await response.json())).not.toContain("v0.5.1");
  });

  it("refuses a symlinked spelling of an unregistered repo just the same", async () => {
    // The gate canonicalizes with realpath before comparing, so a path that
    // resolves outside the registry cannot slip past by spelling.
    const { app, removeCalls } = makeApp();
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([skillEntry("tdd")]),
      "utf8",
    );

    const response = await removeTdd(app, join(repo, "..", "..", "etc"));

    expect(response.status).toBe(403);
    expect(removeCalls).toEqual([]);
  });

  it("reports a skill the repo does not carry as not found", async () => {
    const { app, registry, removeCalls } = makeApp();
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([skillEntry("jobs")]),
      "utf8",
    );
    await registry.register(repo);

    const response = await removeTdd(app, repo);

    expect(response.status).toBe(404);
    expect(removeCalls).toEqual([]);
  });

  it("reports a repo with no lockfile at all as nothing deployed", async () => {
    const { app, registry } = makeApp();
    await registry.register(repo);

    expect((await removeTdd(app, repo)).status).toBe(404);
  });

  it("surfaces a malformed lockfile as a conflict, never a removal", async () => {
    const { app, registry, removeCalls } = makeApp();
    await writeFile(
      join(repo, "apm.lock.yaml"),
      "dependencies: not-a-list\n",
      "utf8",
    );
    await registry.register(repo);

    const response = await removeTdd(app, repo);

    expect(response.status).toBe(409);
    expect(removeCalls).toEqual([]);
  });

  it("refuses when the lockfile entry names no origin to build a ref from", async () => {
    const { app, registry, removeCalls } = makeApp();
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([
        [
          "- resolved_ref: v0.5.1",
          "  virtual_path: skills/tdd",
          "  package_type: claude_skill",
        ].join("\n"),
      ]),
      "utf8",
    );
    await registry.register(repo);

    expect((await removeTdd(app, repo)).status).toBe(409);
    expect(removeCalls).toEqual([]);
  });

  it("refuses a copy with local edits, and never reaches apm", async () => {
    // apm deletes an edited deployed file with no warning, so the refusal has
    // to happen here, not be discovered afterwards.
    const { app, registry, removeCalls } = makeApp({
      deployedState: "diverged",
    });
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([skillEntry("tdd")]),
      "utf8",
    );
    await registry.register(repo);

    const response = await removeTdd(app, repo);

    expect(response.status).toBe(409);
    const body = (await response.json()) as { message: string };
    expect(body.message).toMatch(/local changes/i);
    expect(removeCalls).toEqual([]);
  });

  it("reports an unproven removal as a failure the user can read", async () => {
    const { app, registry } = makeApp({ removed: false });
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([skillEntry("tdd")]),
      "utf8",
    );
    await registry.register(repo);

    const response = await removeTdd(app, repo);

    expect(response.status).toBe(502);
    const body = (await response.json()) as { message: string };
    expect(body.message).toMatch(/\S/);
  });

  it("refuses a primitive type other than a skill", async () => {
    const { app, registry } = makeApp();
    await registry.register(repo);

    const response = await removeRequest(app, {
      type: "hook",
      name: "tdd",
      target: { kind: "repo", repoPath: repo },
    });

    expect(response.status).toBe(422);
  });

  it("refuses a name that is not a lowercase slug", async () => {
    const { app, registry } = makeApp();
    await registry.register(repo);

    const response = await removeRequest(app, {
      type: "skill",
      name: "../etc/passwd",
      target: { kind: "repo", repoPath: repo },
    });

    expect(response.status).toBe(400);
  });

  it("rejects a body that is not the expected shape", async () => {
    const { app } = makeApp();

    expect((await removeRequest(app, { name: "tdd" })).status).toBe(400);
  });

  it("rejects a target kind this slice does not remove from", async () => {
    // Global removal is not part of this slice; the edge refuses it rather than
    // letting it fall through to a repo path that is not there.
    const { app } = makeApp();

    const response = await removeRequest(app, {
      type: "skill",
      name: "tdd",
      target: { kind: "global" },
    });

    expect(response.status).toBe(400);
  });
});
