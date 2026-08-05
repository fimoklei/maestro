// Confirming a release, driven through the real Hono app against a real clone
// and a real bare remote. Mirrors server-harness.test.ts's setup so the plan
// and the confirm are proven against the same journey (#520).
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  ConfigStore,
  HarnessFreshnessStore,
  HarnessGitAdapter,
  InFlightLocks,
  InventoryReader,
  NodeFileSystem,
  PublishRelease,
  ReadHarnessState,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { realRegistry } from "../helpers/real-registry";
import { stubBrowse } from "../helpers/stub-browse";
import { stubConnect } from "../helpers/stub-connect";
import { stubDeploy } from "../helpers/stub-deploy";
import { stubDeployState } from "../helpers/stub-deploy-state";
import { stubDrift } from "../helpers/stub-drift";
import { stubRemove } from "../helpers/stub-remove";

const run = promisify(execFile);

const ORIGIN_URL = "https://github.com/fimoklei/agent-harness.git";

describe("harness release HTTP route", { timeout: 30_000 }, () => {
  let base: string;
  let remote: string;
  let root: string;

  const git = (cwd: string, ...args: string[]) => run("git", args, { cwd });

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "maestro-server-release-"));
    remote = join(base, "remote.git");
    root = join(base, "clone");
    await run("git", ["init", "--bare", "-b", "main", remote]);
    await run("git", ["clone", remote, root]);
    await git(root, "config", "user.email", "test@example.com");
    await git(root, "config", "user.name", "Test");
    await git(root, "config", `url.${remote}.insteadOf`, ORIGIN_URL);
    await git(root, "remote", "set-url", "origin", ORIGIN_URL);
    await mkdir(join(root, ".apm", "skills", "tdd"), { recursive: true });
    await writeFile(
      join(root, ".apm", "skills", "tdd", "SKILL.md"),
      "---\ndescription: Test-driven development loop\n---\n",
      "utf8",
    );
    await writeFile(join(root, "apm.yml"), "name: agent-harness\n", "utf8");
    await git(root, "add", ".");
    await git(root, "commit", "-m", "first skill");
    await git(root, "tag", "v0.1.0");
    await git(root, "push", "--tags", "origin", "HEAD:main");
    await new HarnessGitAdapter().fetch(root);
  }, 30_000);

  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  function makeApp(harnessPath: string | undefined) {
    const fs = new NodeFileSystem();
    const configPath = join(base, "config.json");
    const registry = realRegistry(fs, configPath);
    const store = new ConfigStore({ fs, configPath: () => configPath });
    const inventory = new InventoryReader({
      fs,
      resolvePath: () => harnessPath,
    });
    const locks = new InFlightLocks();
    const resolveRoot = async () =>
      harnessPath === undefined ? undefined : await fs.realpath(harnessPath);
    return createApp({
      registry,
      inventory,
      harness: new ReadHarnessState({
        resolveRoot,
        git: new HarnessGitAdapter(),
        freshness: new HarnessFreshnessStore({ store }),
      }),
      publish: new PublishRelease({
        resolveRoot,
        git: new HarnessGitAdapter(),
        freshness: new HarnessFreshnessStore({ store }),
        locks: new InFlightLocks(),
      }),
      deployState: stubDeployState({ fs }),
      deploy: stubDeploy({ inventory, registry, locks }),
      remove: stubRemove({ registry, locks }),
      drift: stubDrift({ registry }),
      resolveGlobalRoot: () => "/nonexistent-apm-root",
      connect: stubConnect(),
      browse: stubBrowse(),
      enforceOriginHost: false,
    });
  }

  const publish = async (app: ReturnType<typeof makeApp>, body: unknown) =>
    app.request("/api/harness/release", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("confirms a patch release at the freshly read revision", async () => {
    const app = makeApp(root);
    await app.request("/api/harness/refresh", { method: "POST" });
    const head = (await git(root, "rev-parse", "HEAD")).stdout.trim();

    const res = await publish(app, { step: "patch", previousTag: "v0.1.0" });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      tag: "v0.1.1",
      revision: head,
    });
    expect(
      (await git(remote, "rev-parse", "refs/tags/v0.1.1")).stdout.trim(),
    ).toBe(head);
  });

  it("renders the quiet post-release state on the next read, without a second refresh", async () => {
    const app = makeApp(root);
    await app.request("/api/harness/refresh", { method: "POST" });

    await publish(app, { step: "patch", previousTag: "v0.1.0" });
    const res = await app.request("/api/harness");

    await expect(res.json()).resolves.toMatchObject({
      releasedVersion: "v0.1.1",
      releaseState: "released",
    });
  });

  it("leaves the author's checkout, index, and staged work untouched", async () => {
    const app = makeApp(root);
    await app.request("/api/harness/refresh", { method: "POST" });
    const before = (await git(root, "rev-parse", "HEAD")).stdout.trim();
    await writeFile(join(root, "wip.md"), "work in progress\n", "utf8");
    await git(root, "add", "wip.md");

    await publish(app, { step: "patch", previousTag: "v0.1.0" });

    expect((await git(root, "rev-parse", "HEAD")).stdout.trim()).toBe(before);
    expect((await git(root, "status", "--porcelain")).stdout).toContain(
      "A  wip.md",
    );
  });

  it("takes no harness path from the browser", async () => {
    const app = makeApp(root);
    await app.request("/api/harness/refresh", { method: "POST" });

    const res = await publish(app, {
      step: "patch",
      previousTag: "v0.1.0",
      path: "/etc",
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ tag: "v0.1.1" });
  });

  it("rejects a request without a valid version step", async () => {
    const app = makeApp(root);

    const res = await publish(app, {
      step: "sideways",
      previousTag: "v0.1.0",
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("invalid-body");
  });

  it("refuses a confirmation whose previous tag no longer matches the remote", async () => {
    const app = makeApp(root);
    await app.request("/api/harness/refresh", { method: "POST" });

    const res = await publish(app, { step: "patch", previousTag: "v9.9.9" });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("plan-changed");
  });

  it("refuses with a readable error when no harness is connected", async () => {
    const app = makeApp(undefined);

    const res = await publish(app, { step: "patch", previousTag: "v0.1.0" });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("not-configured");
  });
});
