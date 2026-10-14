import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ApmDriverPort } from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { unreachable } from "../helpers/in-memory-app";
import { nodeApp } from "../helpers/node-app";
import { makeRepoDir } from "../helpers/repo-dir";

// A check that could not run is a 200 with { ok: false }, never an HTTP error.
describe("drift HTTP route", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "maestro-drift-"));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  const tddBehind = { name: "tdd", current: "v0.5.0", latest: "v0.5.1" };
  // No harness clone, so every row falls back to Behind.
  const tddRow = { ...tddBehind, reading: "behind" };

  function makeApp(
    outcome:
      | {
          ok: true;
          behind: Array<{ name: string; current: string; latest: string }>;
        }
      | { ok: false; reason?: "unverified" },
  ) {
    const calls: Array<
      { kind: "repo"; repoPath: string } | { kind: "global" }
    > = [];
    // No Harness connected, so the content check has no clone to read.
    const app = nodeApp(
      { HOME: home, MAESTRO_HOME: home },
      {
        apm: unreachable<ApmDriverPort>("apm", {
          checkOutdated: async (target) => {
            calls.push(target);
            return outcome;
          },
        }),
      },
    );
    const registry = {
      register: async (path: string) => {
        const res = await app.request("/api/registry/repos", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path }),
        });
        expect(res.status).toBe(201);
      },
    };
    return { app, registry, calls };
  }

  it("returns the deployed -> latest pair for a registered repo", async () => {
    const repo = await makeRepoDir("maestro-repo-");
    const { app, registry } = makeApp({ ok: true, behind: [tddBehind] });
    await registry.register(repo);

    const res = await app.request(
      `/api/drift?repo=${encodeURIComponent(repo)}`,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ behind: [tddRow] });
    await rm(repo, { recursive: true, force: true });
  });

  it("reports an empty behind list when nothing is behind the latest tag", async () => {
    const repo = await makeRepoDir("maestro-repo-");
    const { app, registry } = makeApp({ ok: true, behind: [] });
    await registry.register(repo);

    const res = await app.request(
      `/api/drift?repo=${encodeURIComponent(repo)}`,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ behind: [] });
    await rm(repo, { recursive: true, force: true });
  });

  it("returns 200 with ok:false when the check could not run", async () => {
    const repo = await makeRepoDir("maestro-repo-");
    const { app, registry } = makeApp({ ok: false });
    await registry.register(repo);

    const res = await app.request(
      `/api/drift?repo=${encodeURIComponent(repo)}`,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false });
    await rm(repo, { recursive: true, force: true });
  });

  it("forwards the unverified reason when apm could not reach the remote", async () => {
    const repo = await makeRepoDir("maestro-repo-");
    const { app, registry } = makeApp({ ok: false, reason: "unverified" });
    await registry.register(repo);

    const res = await app.request(
      `/api/drift?repo=${encodeURIComponent(repo)}`,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, reason: "unverified" });
    await rm(repo, { recursive: true, force: true });
  });

  it("rejects a repo that is not registered", async () => {
    const repo = await makeRepoDir("maestro-repo-");
    const { app } = makeApp({ ok: true, behind: [tddBehind] });

    const res = await app.request(
      `/api/drift?repo=${encodeURIComponent(repo)}`,
    );

    expect(res.status).toBe(403);
    await rm(repo, { recursive: true, force: true });
  });

  it("returns 400 when no repo is given", async () => {
    const { app } = makeApp({ ok: true, behind: [] });

    const res = await app.request("/api/drift");

    expect(res.status).toBe(400);
  });

  it("returns the global behind pair without reading a client path", async () => {
    const { app, calls } = makeApp({ ok: true, behind: [tddBehind] });

    const res = await app.request("/api/drift/global?repo=/tmp/not-used");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ behind: [tddRow] });
    expect(calls).toEqual([{ kind: "global" }]);
  });

  it("returns 200 with ok:false when the global check could not run", async () => {
    const { app } = makeApp({ ok: false });

    const res = await app.request("/api/drift/global");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false });
  });

  it("forwards the unverified reason on the global route", async () => {
    const { app } = makeApp({ ok: false, reason: "unverified" });

    const res = await app.request("/api/drift/global");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, reason: "unverified" });
  });
});
