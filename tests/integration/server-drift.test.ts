import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CheckVersionDrift,
  InFlightLocks,
  InventoryReader,
  NodeFileSystem,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { realRegistry } from "../helpers/real-registry";
import { stubBrowse } from "../helpers/stub-browse";
import { stubConnect } from "../helpers/stub-connect";
import { stubDeploy, stubRetryOperation } from "../helpers/stub-deploy";
import { stubDeployState } from "../helpers/stub-deploy-state";
import { withoutContentCheck } from "../helpers/stub-drift";
import { stubFolderChooser } from "../helpers/stub-folder-chooser";
import { stubHarness } from "../helpers/stub-harness";
import { stubImport } from "../helpers/stub-import";
import { stubPromotes } from "../helpers/stub-promote";
import { stubPublish } from "../helpers/stub-publish";
import { stubRemove } from "../helpers/stub-remove";
import { stubScaffold } from "../helpers/stub-scaffold";
import { stubUpdate } from "../helpers/stub-update";

// Integration lane: drives the real Hono app via app.request. The drift route
// is registry-gated like deploy-state. A check that could not run is a 200 with
// { ok: false } — a legitimate "unknown", never an HTTP error the web treats as
// a crash. The Origin/Host guard is disabled here (it lives in server-security).
describe("drift HTTP route", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "maestro-drift-"));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  const tddBehind = { name: "tdd", current: "v0.5.0", latest: "v0.5.1" };
  // No harness clone to read trees from, so the content question is unanswered
  // and every row falls back to Behind (ADR-0027 §4).
  const tddRow = { ...tddBehind, reading: "behind" };

  function makeApp(
    outcome:
      | {
          ok: true;
          behind: Array<{ name: string; current: string; latest: string }>;
        }
      | { ok: false; reason?: "unverified" },
  ) {
    const fs = new NodeFileSystem();
    const calls: Array<
      { kind: "repo"; repoPath: string } | { kind: "global" }
    > = [];
    const registry = realRegistry(fs, join(home, "config.json"));
    const inventory = new InventoryReader({
      fs,
      resolvePath: () => undefined,
      readReleasedSkills: async () => [],
    });
    const drift = new CheckVersionDrift({
      registry,
      apm: {
        checkOutdated: async (target) => {
          calls.push(target);
          return outcome;
        },
      },
      canonicalPath: (path) => fs.realpath(path),
    });
    const locks = new InFlightLocks();
    const app = createApp({
      importSkill: stubImport(),
      registry,
      inventory,
      deployState: stubDeployState({ fs }),
      deploy: stubDeploy({ inventory, registry, locks }),
      remove: stubRemove({ registry, locks }),
      retryOperation: stubRetryOperation({ registry, locks }),
      drift: withoutContentCheck(drift),
      resolveGlobalRoot: () => "/nonexistent-apm-root",
      harness: stubHarness(),
      publish: stubPublish(),
      ...stubPromotes(),
      connect: stubConnect(),
      scaffold: stubScaffold(),
      browse: stubBrowse(),
      folderChooser: stubFolderChooser(),
      update: stubUpdate(),
      enforceOriginHost: false,
    });
    return { app, registry, calls };
  }

  it("returns the deployed -> latest pair for a registered repo", async () => {
    const repo = await mkdtemp(join(tmpdir(), "maestro-repo-"));
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
    // The up-to-date answer is a successful check with nothing in it — never
    // the { ok: false } a check that could not run returns.
    const repo = await mkdtemp(join(tmpdir(), "maestro-repo-"));
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
    const repo = await mkdtemp(join(tmpdir(), "maestro-repo-"));
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
    const repo = await mkdtemp(join(tmpdir(), "maestro-repo-"));
    const { app, registry } = makeApp({ ok: false, reason: "unverified" });
    await registry.register(repo);

    const res = await app.request(
      `/api/drift?repo=${encodeURIComponent(repo)}`,
    );

    expect(res.status).toBe(200);
    // Distinct from a bare { ok: false }: the web shows "unverified", pointing at
    // auth/network rather than a generic "unknown".
    expect(await res.json()).toEqual({ ok: false, reason: "unverified" });
    await rm(repo, { recursive: true, force: true });
  });

  it("rejects a repo that is not registered", async () => {
    const repo = await mkdtemp(join(tmpdir(), "maestro-repo-"));
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
