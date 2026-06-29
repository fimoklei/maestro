import {
  mkdir,
  mkdtemp,
  realpath as nodeRealpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BrowseFilesystem,
  ConfigStore,
  DeployStateReader,
  InventoryReader,
  NodeFileSystem,
  Registry,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stubConnect } from "../helpers/stub-connect";
import { stubDeploy } from "../helpers/stub-deploy";
import { stubDrift } from "../helpers/stub-drift";

// Integration lane: drives the real browse route against a real sandbox
// filesystem. Home-root ceiling, dirs-only filtering, and symlink escapes are
// proven here on a live disk — the place those can actually misbehave. The
// Origin/Host guard is disabled (its enforcement lives in server-security.test).
describe("filesystem browse HTTP route", () => {
  let home: string;
  let outside: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "maestro-browse-home-"));
    outside = await mkdtemp(join(tmpdir(), "maestro-browse-outside-"));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
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
      connect: stubConnect(),
      deployState,
      deploy: stubDeploy({ inventory, registry }),
      drift: stubDrift({ registry }),
      resolveGlobalRoot: () => "/nonexistent-apm-root",
      browse: new BrowseFilesystem({ fs, homeRoot: () => home }),
      enforceOriginHost: false,
    });
  }

  function postBrowse(app: ReturnType<typeof makeApp>, body: unknown) {
    return app.request("/api/filesystem/children", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("lists only the immediate child directories, never files", async () => {
    await mkdir(join(home, "dev", "repo-b"), { recursive: true });
    await mkdir(join(home, "dev", "repo-a"), { recursive: true });
    await writeFile(join(home, "dev", "notes.txt"), "ignore me", "utf8");
    const realDev = await nodeRealpath(join(home, "dev"));

    const res = await postBrowse(makeApp(), { path: join(home, "dev") });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      path: realDev,
      entries: [
        { name: "repo-a", path: join(realDev, "repo-a") },
        { name: "repo-b", path: join(realDev, "repo-b") },
      ],
    });
  });

  it("defaults an empty path to the home root", async () => {
    await mkdir(join(home, "dev"), { recursive: true });
    const realHome = await nodeRealpath(home);

    const res = await postBrowse(makeApp(), { path: "" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      path: realHome,
      entries: [{ name: "dev", path: join(realHome, "dev") }],
    });
  });

  it("rejects a path outside the home root with 403", async () => {
    const res = await postBrowse(makeApp(), { path: outside });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("outside-root");
    expect(body.message).toMatch(/\S/);
    // The path is never echoed back — it may be a misconfigured secret.
    expect(body.message).not.toContain(outside);
  });

  it("rejects a symlink that escapes the home root with 403", async () => {
    const escapeLink = join(home, "escape");
    await symlink(outside, escapeLink);

    const res = await postBrowse(makeApp(), { path: escapeLink });

    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe(
      "outside-root",
    );
  });

  it("returns 404 for a non-existent path inside the home root", async () => {
    const res = await postBrowse(makeApp(), { path: join(home, "missing") });

    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe("not-found");
  });

  it("rejects a non-existent path outside the home root with 403, not 404", async () => {
    // A missing outside path must look identical to an existing one — otherwise
    // the endpoint leaks existence beyond the home ceiling (ADR-0009).
    const res = await postBrowse(makeApp(), {
      path: join(outside, "definitely-missing"),
    });

    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe(
      "outside-root",
    );
  });

  it("returns 400 for a path that is not a directory", async () => {
    await writeFile(join(home, "file.txt"), "hi", "utf8");

    const res = await postBrowse(makeApp(), { path: join(home, "file.txt") });

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "not-a-directory",
    );
  });

  it("rejects a malformed body with a 400", async () => {
    const res = await postBrowse(makeApp(), { notPath: 1 });

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "invalid-body",
    );
  });
});
