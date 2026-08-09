// Joining a Harness by its GitHub URL, driven through the real Hono connect
// route. The input is spelled as the GitHub URL Maestro must accept and
// redirected to a local bare repo with `url.<path>.insteadOf` through git's
// env config channel, so the whole journey stays offline (LEARNINGS.md ·
// git-config-key-channel-survives-isolation).
import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  BrowseFilesystem,
  ConfigStore,
  ConnectInventory,
  GitCloneAdapter,
  InFlightLocks,
  InventoryReader,
  NodeFileSystem,
  Registry,
  readConfiguredGitOriginUrl,
  resolveDefaultBranch,
  resolveInventoryPath,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { centralInventoryPath } from "../helpers/real-registry";
import { stubDeploy } from "../helpers/stub-deploy";
import { stubDeployState } from "../helpers/stub-deploy-state";
import { stubDrift } from "../helpers/stub-drift";
import { stubHarness } from "../helpers/stub-harness";
import { stubPublish } from "../helpers/stub-publish";
import { stubRemove } from "../helpers/stub-remove";

const run = promisify(execFile);

const GITHUB_URL = "https://github.com/fimoklei/agent-harness";

const MISSING_URL = "https://github.com/fimoklei/does-not-exist";

const IDENTITY = {
  GIT_AUTHOR_NAME: "Fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "Fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
};

describe("joining a Harness by its GitHub url", () => {
  let base: string;
  let home: string;
  let remote: string;

  const git = (cwd: string, ...args: string[]) =>
    run("git", args, { cwd, env: { ...process.env, ...IDENTITY } });

  beforeEach(async () => {
    // Realpath'd: on macOS the temp dir is a symlink, and connect canonicalizes
    // the path it stores.
    base = await realpath(await mkdtemp(join(tmpdir(), "maestro-join-")));
    home = join(base, "home");
    remote = join(base, "remote.git");
    await mkdir(home);
    await run("git", ["init", "--bare", "-b", "main", remote]);

    const seed = join(base, "seed");
    await mkdir(join(seed, ".apm", "skills", "tdd"), { recursive: true });
    await writeFile(join(seed, "apm.yml"), "dependencies: []\n", "utf8");
    await writeFile(
      join(seed, ".apm", "skills", "tdd", "SKILL.md"),
      "---\nname: tdd\ndescription: Test-driven development loop\n---\n\n# tdd\n",
      "utf8",
    );
    await git(seed, "init", "-b", "main");
    await git(seed, "add", ".");
    await git(seed, "commit", "-m", "harness");
    await git(seed, "remote", "add", "origin", remote);
    await git(seed, "push", "origin", "main");

    // Applies to every git this process starts, the clone included, and
    // survives apm's own `GIT_CONFIG_GLOBAL` isolation.
    process.env.GIT_CONFIG_COUNT = "2";
    process.env.GIT_CONFIG_KEY_0 = `url.${remote}.insteadOf`;
    process.env.GIT_CONFIG_VALUE_0 = GITHUB_URL;
    // A second GitHub-shaped url redirected at a repository that does not
    // exist, so the failing clone never leaves this machine either.
    process.env.GIT_CONFIG_KEY_1 = `url.${join(base, "gone.git")}.insteadOf`;
    process.env.GIT_CONFIG_VALUE_1 = MISSING_URL;
  });

  afterEach(async () => {
    delete process.env.GIT_CONFIG_COUNT;
    delete process.env.GIT_CONFIG_KEY_0;
    delete process.env.GIT_CONFIG_VALUE_0;
    delete process.env.GIT_CONFIG_KEY_1;
    delete process.env.GIT_CONFIG_VALUE_1;
    await rm(base, { recursive: true, force: true });
  });

  function makeApp() {
    const fs = new NodeFileSystem();
    const store = new ConfigStore({
      fs,
      configPath: () => join(base, "config.json"),
    });
    const registry = new Registry({
      fs,
      store,
      resolveCentralInventoryPath: centralInventoryPath,
    });
    const inventory = new InventoryReader({
      fs,
      resolvePath: async () => resolveInventoryPath(await store.read(), {}),
    });
    const locks = new InFlightLocks();
    return createApp({
      registry,
      inventory,
      harness: stubHarness(),
      publish: stubPublish(),
      // Wired exactly as production does, with the ceiling pointed at this
      // test's temp home so the proposed destination lands inside it.
      connect: new ConnectInventory({
        fs,
        store,
        originUrl: readConfiguredGitOriginUrl,
        defaultBranch: resolveDefaultBranch,
        homeRoot: () => home,
        clone: new GitCloneAdapter(),
      }),
      deployState: stubDeployState({ fs }),
      deploy: stubDeploy({ inventory, registry, locks }),
      remove: stubRemove({ registry, locks }),
      drift: stubDrift({ registry }),
      resolveGlobalRoot: () => "/nonexistent-apm-root",
      browse: new BrowseFilesystem({ fs, homeRoot: () => home }),
      enforceOriginHost: false,
    });
  }

  function postConnect(app: ReturnType<typeof makeApp>, body: unknown) {
    return app.request("/api/inventory/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("clones the url into a folder named after the repository and joins it", async () => {
    const res = await postConnect(makeApp(), { path: GITHUB_URL });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      outcome: "joined",
      inventoryPath: join(home, "agent-harness"),
      primitiveCount: 1,
    });
  });

  // The clone is a real repository: nothing here may delete it, and the
  // default branch has to be readable from what the clone left behind.
  it("leaves the clone on disk with a resolvable default branch", async () => {
    await postConnect(makeApp(), { path: GITHUB_URL });
    const clone = join(home, "agent-harness");

    expect(await readFile(join(clone, "apm.yml"), "utf8")).toBe(
      "dependencies: []\n",
    );
    const { stdout } = await run("git", [
      "-C",
      clone,
      "symbolic-ref",
      "refs/remotes/origin/HEAD",
    ]);
    expect(stdout.trim()).toBe("refs/remotes/origin/main");
  });

  it("keeps the connected path pointing at the clone", async () => {
    const app = makeApp();

    await postConnect(app, { path: GITHUB_URL });

    const res = await app.request("/api/inventory/config");
    expect(await res.json()).toEqual({
      inventoryPath: join(home, "agent-harness"),
    });
  });

  it("refuses a non-GitHub remote url without cloning anything", async () => {
    const res = await postConnect(makeApp(), {
      path: "https://gitlab.com/fimoklei/agent-harness",
    });

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "not-a-github-url",
    );
    await expect(
      readFile(join(home, "agent-harness", "apm.yml")),
    ).rejects.toThrow();
  });

  it("reports a GitHub url that cannot be cloned without exposing git's output", async () => {
    const res = await postConnect(makeApp(), {
      path: MISSING_URL,
    });

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("clone-failed");
    expect(body.message).not.toContain(base);
  });
});
