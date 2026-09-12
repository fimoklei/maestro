// The Harness home base's read and refresh, driven through the real Hono app
// against a real clone and a real bare remote. The clone's origin is spelled as
// the GitHub URL Maestro must display and redirected to the bare repo with
// `url.<path>.insteadOf`, so the journey stays offline (LEARNINGS.md ·
// git-config-key-channel-survives-isolation).
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
  ReadHarnessState,
  releasedSkillsFromGit,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { removeGitTempTree } from "../helpers/git-fixture";
import { realRegistry } from "../helpers/real-registry";
import { stubBrowse } from "../helpers/stub-browse";
import { stubConnect } from "../helpers/stub-connect";
import { stubDeploy } from "../helpers/stub-deploy";
import { stubDeployState } from "../helpers/stub-deploy-state";
import { stubDrift } from "../helpers/stub-drift";
import { stubImport } from "../helpers/stub-import";
import { stubPromotes } from "../helpers/stub-promote";
import { stubPublish } from "../helpers/stub-publish";
import { stubRemove } from "../helpers/stub-remove";
import { stubReview } from "../helpers/stub-review";
import { stubScaffold } from "../helpers/stub-scaffold";
import { stubUpdate } from "../helpers/stub-update";

const run = promisify(execFile);

const ORIGIN_URL = "https://github.com/fimoklei/agent-harness.git";

type HarnessBody = {
  origin: string;
  releasedVersion: string | null;
  defaultBranch: string | null;
  releaseState: string;
  freshness: { outcome: string | null; lastFetchedAt: string | null };
};

// Each case spawns a dozen git processes (clone, commit, push, fetch), which
// outruns the 5s default on a loaded machine.
describe("harness HTTP routes", { timeout: 30_000 }, () => {
  let base: string;
  let remote: string;
  let root: string;

  const git = (cwd: string, ...args: string[]) => run("git", args, { cwd });

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "maestro-server-harness-"));
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
    // A clone of an empty repo has no origin/HEAD, and released tags live in
    // Maestro's own namespace; one adapter fetch makes it the ordinary clone
    // an author who has opened the Harness once would already have.
    await new HarnessGitAdapter().fetch(root);
  }, 30_000);

  afterEach(async () => {
    await removeGitTempTree(base);
  });

  // A second author's clone, so "merged by the team" is a real push and not a
  // hand-built state.
  async function teammatePushes(message: string, tag?: string) {
    const other = join(base, "other");
    await rm(other, { recursive: true, force: true });
    await run("git", ["clone", remote, other]);
    await git(other, "config", "user.email", "mate@example.com");
    await git(other, "config", "user.name", "Mate");
    // A skill, not a loose file: only skill content moves the Harness between
    // released and pending release, so the teammate's push has to be one (#845).
    await mkdir(join(other, ".apm", "skills", message), { recursive: true });
    await writeFile(
      join(other, ".apm", "skills", message, "SKILL.md"),
      `---\ndescription: ${message}\n---\n`,
      "utf8",
    );
    await git(other, "add", ".");
    await git(other, "commit", "-m", message);
    if (tag !== undefined) {
      await git(other, "tag", tag);
    }
    await git(other, "push", "--tags", "origin", "HEAD:main");
  }

  function makeApp(harnessPath: string | undefined) {
    const fs = new NodeFileSystem();
    const configPath = join(base, "config.json");
    const registry = realRegistry(fs, configPath);
    const store = new ConfigStore({ fs, configPath: () => configPath });
    const inventory = new InventoryReader({
      fs,
      resolvePath: () => harnessPath,
      // The real released read: these suites build real repositories,
      // so Inventory answers from `refs/maestro/tags` as it does live (#841).
      readReleasedSkills: releasedSkillsFromGit(new HarnessGitAdapter()),
    });
    const locks = new InFlightLocks();
    return createApp({
      importSkill: stubImport(),
      registry,
      inventory,
      harness: new ReadHarnessState({
        // Canonicalised server-side: the browser never names the harness.
        resolveRoot: async () =>
          harnessPath === undefined
            ? undefined
            : await fs.realpath(harnessPath),
        git: new HarnessGitAdapter(),
        freshness: new HarnessFreshnessStore({ store }),
        review: stubReview(),
      }),
      publish: stubPublish(),
      ...stubPromotes(),
      deployState: stubDeployState({ fs }),
      deploy: stubDeploy({ inventory, registry, locks }),
      remove: stubRemove({ registry, locks }),
      drift: stubDrift({ registry }),
      resolveGlobalRoot: () => "/nonexistent-apm-root",
      connect: stubConnect(),
      scaffold: stubScaffold(),
      browse: stubBrowse(),
      update: stubUpdate(),
      enforceOriginHost: false,
    });
  }

  const readHarness = async (app: ReturnType<typeof makeApp>) => {
    const res = await app.request("/api/harness");
    expect(res.status).toBe(200);
    return (await res.json()) as HarnessBody;
  };

  const refreshHarness = async (app: ReturnType<typeof makeApp>) => {
    const res = await app.request("/api/harness/refresh", { method: "POST" });
    expect(res.status).toBe(200);
    return (await res.json()) as HarnessBody;
  };

  it("reads the repository facts of the connected harness", async () => {
    const app = makeApp(root);
    await refreshHarness(app);

    await expect(readHarness(app)).resolves.toMatchObject({
      origin: "github.com/fimoklei/agent-harness",
      releasedVersion: "v0.1.0",
      defaultBranch: "main",
      releaseState: "released",
      freshness: { outcome: "fetched" },
    });
  });

  it("names no release before a fetch of its own has confirmed one", async () => {
    // The clone carries the author's tags, not Maestro's; calling that "no
    // release yet" would state a fact nothing has checked (#516).
    const app = makeApp(root);

    await expect(readHarness(app)).resolves.toMatchObject({
      releasedVersion: null,
      releaseState: "unknown",
      freshness: { outcome: null, lastFetchedAt: null },
    });
  });

  it("brings the team's merged work into view on refresh, and dates the picture", async () => {
    const app = makeApp(root);
    await teammatePushes("team-change");

    const body = await refreshHarness(app);

    expect(body.releaseState).toBe("pending-release");
    expect(body.releasedVersion).toBe("v0.1.0");
    expect(body.freshness.outcome).toBe("fetched");
    expect(Date.parse(String(body.freshness.lastFetchedAt))).not.toBeNaN();
  });

  it("reads a release someone else published as the released version", async () => {
    const app = makeApp(root);
    await teammatePushes("their-release", "v0.2.0");

    const body = await refreshHarness(app);

    expect(body.releasedVersion).toBe("v0.2.0");
    expect(body.releaseState).toBe("released");
  });

  it("keeps the last successful fetch time when a later fetch fails", async () => {
    const app = makeApp(root);
    const fetched = await refreshHarness(app);
    await git(root, "config", "--unset", `url.${remote}.insteadOf`);
    await git(
      root,
      "config",
      `url.${join(base, "gone.git")}.insteadOf`,
      ORIGIN_URL,
    );

    const failed = await refreshHarness(app);

    expect(failed.freshness.outcome).toBe("fetch-failed");
    expect(failed.freshness.lastFetchedAt).toBe(
      fetched.freshness.lastFetchedAt,
    );
  });

  it("never puts git's own output, the remote, or the path in a reply", async () => {
    const app = makeApp(root);
    await git(root, "config", "--unset", `url.${remote}.insteadOf`);
    await git(
      root,
      "config",
      `url.${join(base, "gone.git")}.insteadOf`,
      ORIGIN_URL,
    );

    const res = await app.request("/api/harness/refresh", { method: "POST" });
    const raw = await res.text();

    expect(res.status).toBe(200);
    expect(raw).not.toContain(base);
    expect(raw).not.toContain("fatal");
    expect(raw).not.toContain("does not appear to be a git repository");
  });

  it("takes no harness path from the browser", async () => {
    const app = makeApp(root);

    const res = await app.request("/api/harness/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "/etc" }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      origin: "github.com/fimoklei/agent-harness",
    });
  });

  it("refuses both routes with its own code when no harness is connected", async () => {
    const app = makeApp(undefined);

    for (const res of [
      await app.request("/api/harness"),
      await app.request("/api/harness/refresh", { method: "POST" }),
    ]) {
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("not-configured");
    }
  });

  it("refuses an origin apm could never resolve rather than showing a guess", async () => {
    const app = makeApp(root);
    await git(root, "remote", "set-url", "origin", join(base, "remote.git"));

    const res = await app.request("/api/harness");

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("no-usable-origin");
    // The whole reply, not just a sentence: nothing in it may name the path.
    expect(JSON.stringify(body)).not.toContain(base);
  });

  type PlanBody = {
    previousTag: string | null;
    proposedStep: string;
    versions: { major: string; minor: string; patch: string };
    revision: string;
    defaultBranch: string;
    delta: { kind: string; name: string; author: string | null }[];
    findings: { skill: string; problem: string }[];
  };

  it("plans a patch release from the team's merged skill edit", async () => {
    const app = makeApp(root);
    // A teammate edits the one existing skill and pushes it merged.
    const other = join(base, "other");
    await run("git", ["clone", remote, other]);
    await git(other, "config", "user.email", "mate@example.com");
    await git(other, "config", "user.name", "Mate");
    await writeFile(
      join(other, ".apm", "skills", "tdd", "SKILL.md"),
      "---\ndescription: A sharper test-driven loop\n---\n",
      "utf8",
    );
    await git(other, "add", ".");
    await git(other, "commit", "-m", "sharpen tdd");
    await git(other, "push", "origin", "HEAD:main");
    await refreshHarness(app);

    const res = await app.request("/api/harness/release-plan");
    expect(res.status).toBe(200);
    const plan = (await res.json()) as PlanBody;

    expect(plan.previousTag).toBe("v0.1.0");
    expect(plan.proposedStep).toBe("patch");
    expect(plan.versions).toEqual({
      major: "v1.0.0",
      minor: "v0.2.0",
      patch: "v0.1.1",
    });
    expect(plan.defaultBranch).toBe("main");
    expect(plan.revision).toMatch(/^[0-9a-f]{40}$/);
    expect(plan.delta).toEqual([
      { kind: "changed", name: "tdd", author: "Mate" },
    ]);
    expect(plan.findings).toEqual([]);
  });

  it("reports a structurally broken skill without refusing the plan", async () => {
    const app = makeApp(root);
    const other = join(base, "other");
    await run("git", ["clone", remote, other]);
    await git(other, "config", "user.email", "mate@example.com");
    await git(other, "config", "user.name", "Mate");
    // A new skill whose manifest has an empty description: advisory, not fatal.
    await mkdir(join(other, ".apm", "skills", "broken"), { recursive: true });
    await writeFile(
      join(other, ".apm", "skills", "broken", "SKILL.md"),
      "---\ndescription: ''\n---\n",
      "utf8",
    );
    await git(other, "add", ".");
    await git(other, "commit", "-m", "add broken skill");
    await git(other, "push", "origin", "HEAD:main");
    await refreshHarness(app);

    const res = await app.request("/api/harness/release-plan");
    expect(res.status).toBe(200);
    const plan = (await res.json()) as PlanBody;

    expect(plan.proposedStep).toBe("minor");
    expect(plan.findings).toEqual([
      { skill: "broken", problem: "empty-description" },
    ]);
  });

  it("refuses a plan with its own code before any fetch has confirmed a remote", async () => {
    const app = makeApp(root);

    const res = await app.request("/api/harness/release-plan");

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("no-answer");
  });

  it("leaves the author's checkout untouched across a refresh", async () => {
    const app = makeApp(root);
    await teammatePushes("team-change");
    await writeFile(join(root, "wip.md"), "work in progress\n", "utf8");
    await git(root, "add", "wip.md");
    const before = (await git(root, "rev-parse", "HEAD")).stdout.trim();

    await refreshHarness(app);

    expect((await git(root, "rev-parse", "HEAD")).stdout.trim()).toBe(before);
    expect((await git(root, "status", "--porcelain")).stdout).toContain(
      "A  wip.md",
    );
  });
});
