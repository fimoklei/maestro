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
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  ConfigStore,
  ConnectInventory,
  GitCloneAdapter,
  HarnessGitAdapter,
  InFlightLocks,
  InventoryReader,
  isRepositoryRoot,
  NodeFileSystem,
  probeHead,
  Registry,
  readConfiguredGitOriginUrl,
  releasedSkillsFromGit,
  resolveDefaultBranch,
  resolveInventoryPath,
  ScaffoldOffers,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { removeGitTempTree } from "../helpers/git-fixture";
import { centralInventoryPath } from "../helpers/real-registry";
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
    await removeGitTempTree(base);
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
      originUrl: readConfiguredGitOriginUrl,
      // The real released read: these suites build real repositories,
      // so Inventory answers from `refs/maestro/tags` as it does live (#841).
      readReleasedSkills: releasedSkillsFromGit(new HarnessGitAdapter()),
    });
    const locks = new InFlightLocks();
    return createApp({
      importSkill: stubImport(),
      registry,
      inventory,
      harness: stubHarness(),
      publish: stubPublish(),
      ...stubPromotes(),
      // Wired exactly as production does, with the ceiling pointed at this
      // test's temp home so the proposed destination lands inside it.
      connect: new ConnectInventory({
        fs,
        store,
        originUrl: readConfiguredGitOriginUrl,
        defaultBranch: resolveDefaultBranch,
        isRepositoryRoot,
        offers: new ScaffoldOffers(),
        probeHead,
        homeRoot: () => home,
        clone: new GitCloneAdapter(),
      }),
      scaffold: stubScaffold(),
      deployState: stubDeployState({ fs }),
      deploy: stubDeploy({ inventory, registry, locks }),
      remove: stubRemove({ registry, locks }),
      retryOperation: stubRetryOperation({ registry, locks }),
      drift: stubDrift({ registry }),
      resolveGlobalRoot: () => "/nonexistent-apm-root",
      folderChooser: stubFolderChooser(),
      update: stubUpdate(),
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
    // Zero, and confirmed: a fresh clone has no `refs/maestro/tags` until the
    // Harness view fetches, and Inventory answers from the release (#841). The
    // empty Inventory sends the reader to the Harness view, where that happens.
    expect(await res.json()).toEqual({
      outcome: "joined",
      inventoryPath: join(home, "agent-harness"),
      primitiveCount: 0,
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

  it("keeps the local clone and GitHub repository after joining", async () => {
    const app = makeApp();

    await postConnect(app, { path: GITHUB_URL });

    const res = await app.request("/api/inventory/config");
    expect(await res.json()).toEqual({
      inventoryPath: join(home, "agent-harness"),
      githubRepository: "fimoklei/agent-harness",
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

  // git writes the clone url into the clone's config, so a pasted token would
  // land on disk. It has to be refused before any git runs (security.md).
  it("refuses a url carrying a token, so git never sees or stores it", async () => {
    const res = await postConnect(makeApp(), {
      path: "https://user:t0ken@github.com/fimoklei/agent-harness",
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("url-carries-credentials");
    // The whole reply, not just a sentence: nothing in it may carry the token.
    expect(JSON.stringify(body)).not.toContain("t0ken");
    await expect(
      readFile(join(home, "agent-harness", ".git", "config")),
    ).rejects.toThrow();
  });

  // Missing, private and mistyped are indistinguishable from the outside, so
  // they share one code rather than being guessed apart (#555).
  it("reports a GitHub url that cannot be cloned without exposing git's output", async () => {
    const res = await postConnect(makeApp(), {
      path: MISSING_URL,
    });

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("clone-unavailable");
    expect(JSON.stringify(body)).not.toContain(base);
  });

  describe("choosing where the clone lands", () => {
    it("clones into a chosen parent instead of the home ceiling", async () => {
      const parent = join(home, "Projects");
      await mkdir(parent);

      const res = await postConnect(makeApp(), { path: GITHUB_URL, parent });

      expect(res.status).toBe(200);
      expect(
        ((await res.json()) as { inventoryPath: string }).inventoryPath,
      ).toBe(join(parent, "agent-harness"));
      expect(
        await readFile(join(parent, "agent-harness", "apm.yml"), "utf8"),
      ).toBe("dependencies: []\n");
    });

    it("refuses a parent folder that does not exist", async () => {
      const res = await postConnect(makeApp(), {
        path: GITHUB_URL,
        parent: join(home, "nowhere"),
      });

      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe(
        "invalid-parent",
      );
    });

    // A forgotten local copy is connected, never duplicated — and the marker
    // proves the folder on disk was left exactly as it was found.
    it("connects an existing clone of the same repository instead of re-cloning", async () => {
      await postConnect(makeApp(), { path: GITHUB_URL });
      const clone = join(home, "agent-harness");
      await writeFile(join(clone, "MARKER"), "mine\n", "utf8");

      const res = await postConnect(makeApp(), { path: GITHUB_URL });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        outcome: "found",
        inventoryPath: clone,
        primitiveCount: 0,
      });
      expect(await readFile(join(clone, "MARKER"), "utf8")).toBe("mine\n");
    });

    it("refuses a destination occupied by something else and leaves it alone", async () => {
      const occupied = join(home, "agent-harness");
      await mkdir(occupied);
      await writeFile(join(occupied, "notes.txt"), "mine\n", "utf8");

      const res = await postConnect(makeApp(), { path: GITHUB_URL });

      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("destination-occupied");
      expect(JSON.stringify(body)).not.toContain(base);
      expect(await readFile(join(occupied, "notes.txt"), "utf8")).toBe(
        "mine\n",
      );
    });

    // What an interrupted clone leaves: a repository with a remote and no
    // commit at HEAD. Reported with recovery guidance, never cloned over.
    it("reports a partial clone and leaves it on disk", async () => {
      const partial = join(home, "agent-harness");
      await run("git", ["init", "-b", "main", partial]);
      await run("git", ["-C", partial, "remote", "add", "origin", GITHUB_URL]);

      const res = await postConnect(makeApp(), { path: GITHUB_URL });

      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("destination-partial-clone");
      expect(JSON.stringify(body)).not.toContain(base);
      await expect(
        readFile(join(partial, ".git", "config"), "utf8"),
      ).resolves.toContain("origin");
    });

    // A fresh repository of someone else's is not this clone's leftover, and
    // the partial-clone message would tell the user to delete it.
    it("reports a commitless repository of another origin as occupied", async () => {
      const other = join(home, "agent-harness");
      await run("git", ["init", "-b", "main", other]);
      await run("git", [
        "-C",
        other,
        "remote",
        "add",
        "origin",
        "https://github.com/someone/else",
      ]);

      const res = await postConnect(makeApp(), { path: GITHUB_URL });

      expect(res.status).toBe(409);
      expect(((await res.json()) as { error: string }).error).toBe(
        "destination-occupied",
      );
    });
  });
});
