// Scaffolding an empty GitHub repository through the real Hono routes, offline:
// an empty bare repo with an unborn `trunk`, reached by the GitHub URL through
// `url.<path>.insteadOf` (LEARNINGS.md · git-config-key-channel-survives-isolation).
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
  GitHarnessScaffoldAdapter,
  InFlightLocks,
  InventoryReader,
  isRepositoryRoot,
  NodeFileSystem,
  probeHead,
  Registry,
  readConfiguredGitOriginUrl,
  resolveDefaultBranch,
  resolveInventoryPath,
  ScaffoldHarness,
  ScaffoldOffers,
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

const GITHUB_URL = "https://github.com/fimoklei/team-harness";

// Deliberately not `main`: the scaffold pushes what git reports as the default
// branch, and a hardcoded `main` would pass against a `main` fixture.
const DEFAULT_BRANCH = "trunk";

const CANONICAL_FILES = [
  ".apm/skills/.gitkeep",
  ".github/workflows/skill-check.yml",
  "README.md",
  "apm.yml",
];

describe("scaffolding a Harness into an empty GitHub repository", () => {
  let base: string;
  let home: string;
  let remote: string;
  let clone: string;

  const git = (cwd: string, ...args: string[]) => run("git", args, { cwd });

  const read = async (cwd: string, ...args: string[]) =>
    (await git(cwd, ...args)).stdout.trim();

  beforeEach(async () => {
    // Realpath'd: on macOS the temp dir is a symlink, and connect canonicalizes
    // the path it stores.
    base = await realpath(await mkdtemp(join(tmpdir(), "maestro-scaffold-")));
    home = join(base, "home");
    remote = join(base, "remote.git");
    clone = join(home, "team-harness");
    await mkdir(home);
    // Empty: no seed, no commit. This is the repository the user just created.
    await run("git", [
      "init",
      "--bare",
      `--initial-branch=${DEFAULT_BRANCH}`,
      remote,
    ]);

    process.env.GIT_CONFIG_COUNT = "1";
    process.env.GIT_CONFIG_KEY_0 = `url.${remote}.insteadOf`;
    process.env.GIT_CONFIG_VALUE_0 = GITHUB_URL;
    // The adapter runs the user's own git, so the commit needs an identity the
    // machine's config may not have. `.invalid` can never resolve (RFC 2606).
    process.env.GIT_AUTHOR_NAME = "Fixture";
    process.env.GIT_AUTHOR_EMAIL = "fixture@example.invalid";
    process.env.GIT_COMMITTER_NAME = "Fixture";
    process.env.GIT_COMMITTER_EMAIL = "fixture@example.invalid";
  });

  afterEach(async () => {
    for (const key of [
      "GIT_CONFIG_COUNT",
      "GIT_CONFIG_KEY_0",
      "GIT_CONFIG_VALUE_0",
      "GIT_AUTHOR_NAME",
      "GIT_AUTHOR_EMAIL",
      "GIT_COMMITTER_NAME",
      "GIT_COMMITTER_EMAIL",
    ]) {
      delete process.env[key];
    }
    await rm(base, { recursive: true, force: true });
  });

  function makeApp() {
    const fs = new NodeFileSystem();
    const store = new ConfigStore({
      fs,
      configPath: () => join(base, "config.json"),
    });
    const inventory = new InventoryReader({
      fs,
      resolvePath: async () => resolveInventoryPath(await store.read(), {}),
    });
    // One register, as production wires it: connect's offer is the scaffold's
    // authority to write into the repository (#556).
    const offers = new ScaffoldOffers();
    const connect = new ConnectInventory({
      fs,
      store,
      originUrl: readConfiguredGitOriginUrl,
      defaultBranch: resolveDefaultBranch,
      isRepositoryRoot,
      probeHead,
      homeRoot: () => home,
      clone: new GitCloneAdapter(),
      offers,
    });
    const locks = new InFlightLocks();
    const registry = new Registry({
      fs,
      store,
      resolveCentralInventoryPath: centralInventoryPath,
    });
    return createApp({
      registry,
      inventory,
      harness: stubHarness(),
      publish: stubPublish(),
      connect,
      // The real adapter: this journey's whole point is the git it runs.
      scaffold: new ScaffoldHarness({
        fs,
        git: new GitHarnessScaffoldAdapter(),
        locks: new InFlightLocks(),
        offers,
        originUrl: readConfiguredGitOriginUrl,
        connect: (path) => connect.connect(path),
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

  const post = (
    app: ReturnType<typeof makeApp>,
    route: string,
    body: unknown,
  ) =>
    app.request(route, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  // The gate's first half: pasting the URL clones the empty repository and the
  // refusal to connect it carries the offer.
  async function offerFor(app: ReturnType<typeof makeApp>): Promise<string> {
    const res = await post(app, "/api/inventory/connect", { path: GITHUB_URL });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; path: string };
    expect(body.error).toBe("scaffoldable");
    return body.path;
  }

  it("clones an empty repository and offers to scaffold it", async () => {
    const offered = await offerFor(makeApp());

    expect(offered).toBe(clone);
    // An empty clone lands on the branch the remote advertised, even unborn.
    expect(await read(clone, "symbolic-ref", "HEAD")).toBe(
      `refs/heads/${DEFAULT_BRANCH}`,
    );
  });

  it("writes the canonical shape, pushes it and lands connected", async () => {
    const app = makeApp();
    const offered = await offerFor(app);

    const res = await post(app, "/api/harness/scaffold", { path: offered });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      outcome: "scaffolded",
      inventoryPath: clone,
      primitiveCount: 0,
    });

    for (const file of CANONICAL_FILES) {
      expect(await readFile(join(clone, file), "utf8")).toBeDefined();
    }
    expect(await readFile(join(clone, "apm.yml"), "utf8")).toContain(
      "name: team-harness",
    );
    // The workflow says which runner it assumes, in the file (#556).
    const workflow = await readFile(
      join(clone, ".github/workflows/skill-check.yml"),
      "utf8",
    );
    expect(workflow).toContain("ubuntu-latest");
    expect(workflow).toContain("missing-manifest");
    expect(workflow).toContain("invalid-frontmatter");
    expect(workflow).toContain("empty-description");
  });

  it("commits the scaffold once and pushes it to the repository's own default branch", async () => {
    const app = makeApp();

    await post(app, "/api/harness/scaffold", { path: await offerFor(app) });

    expect(await read(clone, "rev-list", "--count", "HEAD")).toBe("1");
    expect(
      (await read(clone, "show", "--name-only", "--format=", "HEAD"))
        .split("\n")
        .sort(),
    ).toEqual(CANONICAL_FILES);

    // The remote holds it, on `trunk` — never a hardcoded `main`.
    expect(
      await read(remote, "rev-parse", `refs/heads/${DEFAULT_BRANCH}`),
    ).toBe(await read(clone, "rev-parse", "HEAD"));
    await expect(git(remote, "rev-parse", "refs/heads/main")).rejects.toThrow();
  });

  it("creates no tag, locally or on the remote", async () => {
    const app = makeApp();

    await post(app, "/api/harness/scaffold", { path: await offerFor(app) });

    expect(await read(clone, "tag", "--list")).toBe("");
    expect(await read(remote, "for-each-ref", "refs/tags")).toBe("");
  });

  it("sets the local origin/HEAD the empty clone never got", async () => {
    const app = makeApp();
    const offered = await offerFor(app);
    // Absent after the clone, and the push does not write it either (#552 G3).
    await expect(
      git(clone, "symbolic-ref", "refs/remotes/origin/HEAD"),
    ).rejects.toThrow();

    await post(app, "/api/harness/scaffold", { path: offered });

    expect(await read(clone, "symbolic-ref", "refs/remotes/origin/HEAD")).toBe(
      `refs/remotes/origin/${DEFAULT_BRANCH}`,
    );
  });

  it("leaves unrelated staged and dirty work untouched", async () => {
    const app = makeApp();
    const offered = await offerFor(app);
    await writeFile(join(clone, "staged.txt"), "mine\n", "utf8");
    await writeFile(join(clone, "dirty.txt"), "also mine\n", "utf8");
    await git(clone, "add", "--", "staged.txt");

    await post(app, "/api/harness/scaffold", { path: offered });

    const status = await read(clone, "status", "--porcelain");
    expect(status).toContain("A  staged.txt");
    expect(status).toContain("?? dirty.txt");
    expect(
      await read(clone, "show", "--name-only", "--format=", "HEAD"),
    ).not.toContain("staged.txt");
    expect(await readFile(join(clone, "dirty.txt"), "utf8")).toBe(
      "also mine\n",
    );
  });

  // The refusal tells the user to fix git's identity and try again, so the
  // clone has to be back where it started for that retry to mean anything.
  it("removes a half-written scaffold when the commit fails, so a retry works", async () => {
    const app = makeApp();
    const offered = await offerFor(app);
    // An empty ident is refused by git itself, whatever the machine's config
    // says (measured, git 2.50.1: "fatal: empty ident name (for <>)").
    process.env.GIT_AUTHOR_NAME = "";
    process.env.GIT_AUTHOR_EMAIL = "";
    process.env.GIT_COMMITTER_NAME = "";
    process.env.GIT_COMMITTER_EMAIL = "";

    const failed = await post(app, "/api/harness/scaffold", { path: offered });

    expect(failed.status).toBe(422);
    expect(await failed.json()).toMatchObject({ error: "commit-failed" });
    for (const file of CANONICAL_FILES) {
      await expect(readFile(join(clone, file), "utf8")).rejects.toThrow();
    }
    // Neither on disk nor claimed by the index.
    expect(await read(clone, "status", "--porcelain")).toBe("");

    process.env.GIT_AUTHOR_NAME = "Fixture";
    process.env.GIT_AUTHOR_EMAIL = "fixture@example.invalid";
    process.env.GIT_COMMITTER_NAME = "Fixture";
    process.env.GIT_COMMITTER_EMAIL = "fixture@example.invalid";

    const retry = await post(app, "/api/harness/scaffold", { path: offered });

    expect(retry.status).toBe(200);
    expect(await read(clone, "rev-list", "--count", "HEAD")).toBe("1");
  });

  // The route writes, commits and pushes with the machine's own git
  // credentials, so the path it acts on is not the client's to pick (#556).
  it("refuses a repository the gate never offered, without touching it", async () => {
    const app = makeApp();
    // A real clone of the same empty repository, reached without ever asking
    // the gate about it.
    const sneaked = join(home, "sneaked");
    await run("git", ["clone", GITHUB_URL, sneaked]);

    const res = await post(app, "/api/harness/scaffold", { path: sneaked });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "not-offered" });
    await expect(readFile(join(sneaked, "apm.yml"), "utf8")).rejects.toThrow();
    await expect(git(sneaked, "rev-parse", "HEAD")).rejects.toThrow();
  });

  it("names the repository-relative path of an entry it would overwrite", async () => {
    const app = makeApp();
    const offered = await offerFor(app);
    await mkdir(join(clone, ".github", "workflows"), { recursive: true });

    const res = await post(app, "/api/harness/scaffold", { path: offered });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "path-occupied",
      message: expect.any(String),
      path: ".github",
    });
    // Nothing written, nothing committed, nothing pushed.
    await expect(readFile(join(clone, "apm.yml"), "utf8")).rejects.toThrow();
    await expect(git(clone, "rev-parse", "HEAD")).rejects.toThrow();
  });

  it("reports a rejected push as a normal outcome and keeps the local commit", async () => {
    const app = makeApp();
    const offered = await offerFor(app);
    await writeFile(
      join(remote, "hooks", "pre-receive"),
      "#!/bin/sh\nexit 1\n",
      { encoding: "utf8", mode: 0o755 },
    );

    const res = await post(app, "/api/harness/scaffold", { path: offered });

    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toBe(
      "push-rejected",
    );
    // The work survives: one local commit, and the remote still empty.
    expect(await read(clone, "rev-list", "--count", "HEAD")).toBe("1");
    expect(await read(remote, "for-each-ref", "refs/heads")).toBe("");
  });

  it("refuses to scaffold a repository that is already a Harness", async () => {
    const app = makeApp();
    const offered = await offerFor(app);
    await post(app, "/api/harness/scaffold", { path: offered });

    const again = await post(app, "/api/harness/scaffold", { path: offered });

    expect(again.status).toBe(409);
    expect(((await again.json()) as { error: string }).error).toBe(
      "already-a-harness",
    );
  });

  // `git config --get remote.origin.url` answers from the enclosing repository,
  // so a subdirectory reads as a GitHub clone. Scaffolding one would write into
  // it and push to a repository the user never pointed at.
  it("neither offers nor scaffolds a subdirectory of a repository", async () => {
    const app = makeApp();
    await offerFor(app);
    const inside = join(clone, "docs");
    await mkdir(inside);

    const offer = await post(app, "/api/inventory/connect", { path: inside });
    expect(((await offer.json()) as { error: string }).error).toBe(
      "not-an-inventory",
    );

    // Refused for having no offer, one step before the scaffold's own
    // repository check reads it (that check is covered in scaffold-harness.test.ts).
    const res = await post(app, "/api/harness/scaffold", { path: inside });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("not-offered");
    await expect(readFile(join(inside, "apm.yml"), "utf8")).rejects.toThrow();
    await expect(git(clone, "rev-parse", "HEAD")).rejects.toThrow();
  });

  it("refuses to scaffold a plain directory the gate never offered", async () => {
    const plain = join(base, "just-a-folder");
    await mkdir(plain);

    const res = await post(makeApp(), "/api/harness/scaffold", { path: plain });

    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("not-offered");
  });
});
