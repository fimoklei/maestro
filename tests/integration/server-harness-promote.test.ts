// Promoting one skill, driven through the real Hono app against a real clone
// and a real bare remote. Extends the core journey in harness-promote.test.ts
// with the route the row action presses: what the browser sends is a name, and
// what comes back is a branch, a link, or Maestro's own words (#577).
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  ConfigStore,
  HarnessFreshnessStore,
  HarnessGitAdapter,
  type HarnessState,
  InFlightLocks,
  InventoryReader,
  NodeFileSystem,
  PromoteSkill,
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
import { stubImport } from "../helpers/stub-import";

import { stubPublish } from "../helpers/stub-publish";
import { stubRemove } from "../helpers/stub-remove";
import { stubScaffold } from "../helpers/stub-scaffold";

const run = promisify(execFile);

const ORIGIN_URL = "https://github.com/fimoklei/agent-harness.git";

describe("harness promote HTTP route", { timeout: 30_000 }, () => {
  let base: string;
  let remote: string;
  let root: string;

  const git = (cwd: string, ...args: string[]) => run("git", args, { cwd });

  const writeSkill = async (name: string, body: string) => {
    await mkdir(join(root, ".apm", "skills", name), { recursive: true });
    await writeFile(
      join(root, ".apm", "skills", name, "SKILL.md"),
      `---\ndescription: ${body}\n---\n`,
      "utf8",
    );
  };

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "maestro-server-promote-"));
    remote = join(base, "remote.git");
    root = join(base, "clone");
    await run("git", ["init", "--bare", "-b", "main", remote]);
    await run("git", ["clone", remote, root]);
    await git(root, "config", "user.email", "test@example.com");
    await git(root, "config", "user.name", "Test");
    // git resolves the GitHub origin to the bare repo next door, so the suite
    // stays offline while the pull-request link is built from a real origin
    // (LEARNINGS · git-remote-get-url).
    await git(root, "config", `url.${remote}.insteadOf`, ORIGIN_URL);
    await git(root, "remote", "set-url", "origin", ORIGIN_URL);
    await writeSkill("tdd", "as published");
    await writeFile(join(root, "apm.yml"), "name: agent-harness\n", "utf8");
    await git(root, "add", ".");
    await git(root, "commit", "-m", "first skill");
    // Released once already, so a merged promotion reads as work waiting for
    // the next release rather than a harness that never had one.
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
    const harness = new ReadHarnessState({
      resolveRoot,
      git: new HarnessGitAdapter(),
      freshness: new HarnessFreshnessStore({ store }),
    });
    return createApp({
      importSkill: stubImport(),
      registry,
      inventory,
      harness,
      publish: stubPublish(),
      promote: new PromoteSkill({
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
      scaffold: stubScaffold(),
      browse: stubBrowse(),
      enforceOriginHost: false,
    });
  }

  const promote = async (app: ReturnType<typeof makeApp>, body: unknown) =>
    app.request("/api/harness/promote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  // The remote's own view of the pushed branch, so nothing is proved from the
  // clone that pushed it.
  const promoted = async (...args: string[]) =>
    (await git(remote, ...args, "refs/heads/maestro/tdd")).stdout.trim();

  it("pushes the named skill and hands back the branch and its pull-request link", async () => {
    await writeSkill("tdd", "edited on disk");
    const app = makeApp(root);

    const response = await promote(app, { name: "tdd" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      branch: "maestro/tdd",
      pullRequestUrl:
        "https://github.com/fimoklei/agent-harness/compare/main...maestro/tdd?expand=1",
    });
    expect(
      (
        await git(
          remote,
          "show",
          "refs/heads/maestro/tdd:.apm/skills/tdd/SKILL.md",
        )
      ).stdout,
    ).toContain("edited on disk");
  });

  it("leaves HEAD, the real index, and the working tree exactly as they were", async () => {
    await writeFile(join(root, "staged.md"), "staged\n", "utf8");
    await git(root, "add", "staged.md");
    await writeSkill("tdd", "edited on disk");
    const head = (await git(root, "rev-parse", "HEAD")).stdout.trim();
    const status = (await git(root, "status", "--porcelain")).stdout;
    const branches = (await git(root, "branch", "--list")).stdout;

    await promote(makeApp(root), { name: "tdd" });

    expect((await git(root, "rev-parse", "HEAD")).stdout.trim()).toBe(head);
    expect((await git(root, "status", "--porcelain")).stdout).toBe(status);
    expect((await git(root, "branch", "--list")).stdout).toBe(branches);
  });

  it("moves the row to Pending review, and to Pending release once it is merged", async () => {
    await writeSkill("tdd", "edited on disk");
    const app = makeApp(root);
    await promote(app, { name: "tdd" });

    const promoted = (await (
      await app.request("/api/harness/refresh", { method: "POST" })
    ).json()) as HarnessState;
    expect(promoted.movements).toEqual([
      { skill: "tdd", state: "pending-review", deletion: false },
    ]);

    // Merged the way a reviewer would, in the fixture's own remote: the row is
    // then the team's, not the author's, and no receipt was ever stored.
    await git(
      remote,
      "update-ref",
      "refs/heads/main",
      "refs/heads/maestro/tdd",
    );
    const merged = (await (
      await app.request("/api/harness/refresh", { method: "POST" })
    ).json()) as HarnessState;
    expect(merged.movements).toEqual([]);
    expect(merged.releaseState).toBe("pending-release");
  });

  it("never forces the promote branch, whatever a second press answers", async () => {
    // A reply the browser never saw: the author presses again. Whether the
    // second commit is byte-identical to the first — same tree, same parent,
    // same second — or a new object the remote refuses as no descendant, the
    // branch is never rewritten. A cumulative branch is #578's job.
    await writeSkill("tdd", "edited on disk");
    const app = makeApp(root);
    await promote(app, { name: "tdd" });
    const first = await promoted("rev-parse");

    await promote(app, { name: "tdd" });

    expect(await promoted("rev-parse")).toBe(first);
    const state = (await (
      await app.request("/api/harness/refresh", { method: "POST" })
    ).json()) as HarnessState;
    expect(state.movements).toEqual([
      { skill: "tdd", state: "pending-review", deletion: false },
    ]);
  });

  it("refuses a name that is not a skill name, before it reaches git", async () => {
    const response = await promote(makeApp(root), { name: "../etc" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "invalid-skill",
      message: expect.stringContaining("lowercase letters"),
    });
  });

  it("refuses a body that carries no name", async () => {
    const response = await promote(makeApp(root), { skill: "tdd" });

    expect(response.status).toBe(400);
  });

  it("says nothing is connected when no harness is", async () => {
    const response = await promote(makeApp(undefined), { name: "tdd" });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "not-configured" });
  });

  it("states a refused push in Maestro's words, leaking no git output or path", async () => {
    // A branch carrying work this commit does not descend from: the remote
    // refuses, and nothing is forced over it.
    const other = join(base, "other");
    await run("git", ["clone", remote, other]);
    await git(other, "config", "user.email", "mate@example.com");
    await git(other, "config", "user.name", "Mate");
    await writeFile(join(other, "theirs.md"), "theirs\n", "utf8");
    await git(other, "add", ".");
    await git(other, "commit", "-m", "their promotion");
    await git(other, "push", "origin", "HEAD:refs/heads/maestro/tdd");
    await writeSkill("tdd", "edited on disk");

    const response = await promote(makeApp(root), { name: "tdd" });
    const body = await response.text();

    expect(response.status).toBe(502);
    expect(JSON.parse(body)).toEqual({
      error: "promote-failed",
      message: expect.any(String),
    });
    expect(body).not.toContain(root);
    expect(body).not.toContain("git");
  });

  it("closes promote while the remote's answer is unknown", async () => {
    // The origin stays a GitHub URL — only what git resolves it to is gone, so
    // this is an unreachable remote, the same rule that closes Release.
    await git(root, "config", "--unset", `url.${remote}.insteadOf`);
    await git(
      root,
      "config",
      `url.${join(base, "gone.git")}.insteadOf`,
      ORIGIN_URL,
    );
    await writeSkill("tdd", "edited on disk");

    const response = await promote(makeApp(root), { name: "tdd" });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "no-answer" });
  });
});
