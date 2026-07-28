import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
  type SupportedTool,
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
    // The tools the machine is pretending to have. Only the global route reads
    // it; an empty list is the no-supported-tool refusal.
    detectedTools?: SupportedTool[];
  }) {
    const fs = new NodeFileSystem();
    const registry = new Registry({
      fs,
      store: new ConfigStore({ fs, configPath: join(home, "config.json") }),
    });
    const inventory = new InventoryReader({ fs, resolvePath: () => undefined });
    const removeCalls: Array<{ target: DeployTarget; ref: string }> = [];
    const classifyCalls: Array<{ tools?: readonly SupportedTool[] }> = [];
    const remove = new RemoveDeployedSkill({
      registry,
      deployedRef: new DeployedRefAdapter({
        fs,
        // HOME redirected at the sandbox, so the global lockfile this resolves
        // is the test's own — never the real ~/.apm (apm-driver.md § Danger).
        location: new DeployedLocation({ HOME: home }),
      }),
      deployedContent: {
        classify: async ({ tools }) => {
          classifyCalls.push({ tools });
          return options?.deployedState ?? "clean";
        },
      },
      apm: {
        removeSkill: async (input) => {
          removeCalls.push(input);
          return (options?.removed ?? true) ? { ok: true } : { ok: false };
        },
      },
      toolPresence: {
        detectGlobalTools: async () => options?.detectedTools ?? ["claude"],
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
    return { app, registry, removeCalls, classifyCalls };
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

  it("removes a copy with local edits the user already confirmed", async () => {
    // The confirmation stated the consequence through the preflight route
    // below, so this request is the user's informed word — it is carried out
    // rather than refused a second time (#337).
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

    expect(response.status).toBe(200);
    expect(removeCalls).toHaveLength(1);
  });

  it("still refuses a copy it cannot read, confirmed or not", async () => {
    // Not a divergence the user can consent to: we cannot tell what is there,
    // and apm would delete it anyway.
    const { app, registry, removeCalls } = makeApp({
      deployedState: "unreadable",
    });
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([skillEntry("tdd")]),
      "utf8",
    );
    await registry.register(repo);

    expect((await removeTdd(app, repo)).status).toBe(409);
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

  // The user scope. Its lockfile location is apm's own, resolved server-side, so
  // the request carries no path at all (J07, #338).
  describe("the global target", () => {
    // Resolved per call, not at collection time: `home` is a fresh sandbox per
    // test.
    async function writeGlobalLockfile(entries: string[]) {
      const apmRoot = join(home, ".apm");
      await mkdir(apmRoot, { recursive: true });
      await writeFile(
        join(apmRoot, "apm.lock.yaml"),
        lockfileWith(entries),
        "utf8",
      );
    }

    const removeGlobally = (app: ReturnType<typeof makeApp>["app"]) =>
      removeRequest(app, {
        type: "skill",
        name: "tdd",
        target: { kind: "global" },
      });

    it("removes the skill with the ref the global lockfile records", async () => {
      const { app, removeCalls } = makeApp();
      await writeGlobalLockfile([skillEntry("tdd")]);

      const response = await removeGlobally(app);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        removed: { type: "skill", name: "tdd" },
      });
      expect(removeCalls).toEqual([
        {
          target: { kind: "global" },
          ref: "github.com/fimoklei/agent-harness/skills/tdd#v0.5.1",
        },
      ]);
    });

    it("takes no path from the client, even one that is offered", async () => {
      // A repoPath alongside a global kind must not widen what the route reads:
      // the discriminated union drops it, and the location stays apm's own.
      const { app, removeCalls } = makeApp();
      await writeGlobalLockfile([skillEntry("tdd")]);

      const response = await removeRequest(app, {
        type: "skill",
        name: "tdd",
        target: { kind: "global", repoPath: "/etc" },
      });

      expect(response.status).toBe(200);
      expect(removeCalls).toEqual([
        {
          target: { kind: "global" },
          ref: "github.com/fimoklei/agent-harness/skills/tdd#v0.5.1",
        },
      ]);
    });

    it("checks only the copies the detected tools would have", async () => {
      const { app, classifyCalls } = makeApp({ detectedTools: ["codex"] });
      await writeGlobalLockfile([skillEntry("tdd")]);

      await removeGlobally(app);

      expect(classifyCalls).toEqual([{ tools: ["codex"] }]);
    });

    it("refuses when the machine has no supported tool", async () => {
      const { app, removeCalls } = makeApp({ detectedTools: [] });
      await writeGlobalLockfile([skillEntry("tdd")]);

      const response = await removeGlobally(app);

      expect(response.status).toBe(409);
      expect(removeCalls).toEqual([]);
      const body = (await response.json()) as { message: string };
      expect(body.message).toMatch(/\S/);
    });

    it("reports a skill the global scope does not carry as not found", async () => {
      const { app, removeCalls } = makeApp();
      await writeGlobalLockfile([skillEntry("jobs")]);

      expect((await removeGlobally(app)).status).toBe(404);
      expect(removeCalls).toEqual([]);
    });

    it("names what the removal would destroy before it runs", async () => {
      const { app, removeCalls } = makeApp({ deployedState: "diverged" });

      const response = await app.request("/api/deploy/remove/preflight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "skill",
          name: "tdd",
          target: { kind: "global" },
        }),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        warning: "local-edits-will-be-lost",
      });
      expect(removeCalls).toEqual([]);
    });
  });

  // The check the confirmation runs before the user commits. It answers what
  // the removal would destroy; it never removes anything itself.
  describe("preflight", () => {
    const preflightTdd = (
      app: ReturnType<typeof makeApp>["app"],
      repoPath: string,
    ) =>
      app.request("/api/deploy/remove/preflight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "skill",
          name: "tdd",
          target: { kind: "repo", repoPath },
        }),
      });

    it("names local edits as the thing a removal would destroy", async () => {
      const { app, registry, removeCalls } = makeApp({
        deployedState: "diverged",
      });
      await registry.register(repo);

      const response = await preflightTdd(app, repo);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        warning: "local-edits-will-be-lost",
      });
      expect(removeCalls).toEqual([]);
    });

    it("keeps an unverifiable copy apart from a diverged one", async () => {
      const { app, registry } = makeApp({ deployedState: "unverifiable" });
      await registry.register(repo);

      expect(await (await preflightTdd(app, repo)).json()).toEqual({
        warning: "cannot-verify-local-edits",
      });
    });

    it("warns about nothing when the copy still matches its lockfile", async () => {
      const { app, registry } = makeApp({ deployedState: "clean" });
      await registry.register(repo);

      expect(await (await preflightTdd(app, repo)).json()).toEqual({
        warning: null,
      });
    });

    it("refuses an unregistered repo, so it cannot probe a lockfile", async () => {
      const { app } = makeApp({ deployedState: "diverged" });

      expect((await preflightTdd(app, repo)).status).toBe(403);
    });

    it("rejects a body that is not the expected shape", async () => {
      const { app } = makeApp();

      const response = await app.request("/api/deploy/remove/preflight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "tdd" }),
      });

      expect(response.status).toBe(400);
    });
  });
});
