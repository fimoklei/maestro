import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ConfigStore,
  DeployStateReader,
  InventoryReader,
  NodeFileSystem,
  Registry,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stubDeploy } from "../helpers/stub-deploy";

// Integration lane for global (user-scope) deploy-state. The server resolves the
// user-scope location itself — no client-supplied path crosses the boundary — so
// the route takes no query. The location is injected as a sandbox here, so this
// test never reads the real ~/.apm (see .claude/rules/apm-driver.md safety note).
describe("global deploy-state HTTP route", () => {
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

  function makeApp() {
    const fs = new NodeFileSystem();
    const registry = new Registry({
      fs,
      store: new ConfigStore({ fs, configPath: join(home, "config.json") }),
    });
    const inventory = new InventoryReader({ fs, resolvePath: () => undefined });
    const deployState = new DeployStateReader({ fs });
    return createApp({
      registry,
      inventory,
      deployState,
      deploy: stubDeploy({ inventory, registry }),
      resolveGlobalRoot: () => apmRoot,
      enforceOriginHost: false,
    });
  }

  const tddLockfile = [
    "lockfile_version: '1'",
    "apm_version: 0.16.0",
    "dependencies:",
    "- repo_url: fimoklei/agent-harness",
    "  host: github.com",
    "  resolved_commit: ec491f154c9d5c9a6c5db56d1946c4c34f3899bb",
    "  resolved_ref: v0.5.0",
    "  virtual_path: skills/tdd",
    "  is_virtual: true",
    "  package_type: claude_skill",
    "  deployed_files:",
    "  - .claude/skills/tdd",
    "  - .agents/skills/tdd",
    "  content_hash: sha256:abc",
    "",
  ].join("\n");

  it("lists globally deployed skills with their human tag version", async () => {
    await writeFile(join(apmRoot, "apm.lock.yaml"), tddLockfile, "utf8");

    const res = await makeApp().request("/api/deploy-state/global");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
      skipped: [],
    });
  });

  it("shows an empty list when nothing is deployed globally", async () => {
    // No global apm.lock.yaml: nothing deployed yet, an empty state, not an error.
    const res = await makeApp().request("/api/deploy-state/global");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ primitives: [], skipped: [] });
  });

  it("surfaces a visible error for a malformed global lockfile", async () => {
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
    await writeFile(join(apmRoot, "apm.lock.yaml"), tddLockfile, "utf8");

    // Even with a bogus ?repo, the server reads its own resolved location.
    const res = await makeApp().request(
      "/api/deploy-state/global?repo=/etc/passwd",
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
      skipped: [],
    });
  });
});
