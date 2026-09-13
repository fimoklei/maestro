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
  DeleteLocalSkill,
  HarnessFreshnessStore,
  HarnessGitAdapter,
  type HarnessState,
  InFlightLocks,
  InventoryReader,
  NodeCopyTreeFs,
  NodeFileSystem,
  PromoteSkill,
  PromoteSkillDeletion,
  ProposalActions,
  ReadHarnessState,
  RestoreSkill,
  releasedSkillsFromGit,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { removeGitTempTree } from "../helpers/git-fixture";
import { realRegistry } from "../helpers/real-registry";
import { stubBrowse } from "../helpers/stub-browse";
import { stubConnect } from "../helpers/stub-connect";
import { stubDeploy, stubRetryOperation } from "../helpers/stub-deploy";
import { stubDeployState } from "../helpers/stub-deploy-state";
import { stubDrift } from "../helpers/stub-drift";
import { stubImport } from "../helpers/stub-import";
import { stubPublish } from "../helpers/stub-publish";
import { stubRemove } from "../helpers/stub-remove";
import { stubReview } from "../helpers/stub-review";
import { stubScaffold } from "../helpers/stub-scaffold";
import { stubUpdate } from "../helpers/stub-update";

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
    await removeGitTempTree(base);
  });

  function makeApp(harnessPath: string | undefined, review = stubReview()) {
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
    const resolveRoot = async () =>
      harnessPath === undefined ? undefined : await fs.realpath(harnessPath);
    const harness = new ReadHarnessState({
      resolveRoot,
      git: new HarnessGitAdapter(),
      freshness: new HarnessFreshnessStore({ store }),
      review,
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
        review,
        locks: new InFlightLocks(),
      }),
      promoteDeletion: new PromoteSkillDeletion({
        resolveRoot,
        git: new HarnessGitAdapter(),
        freshness: new HarnessFreshnessStore({ store }),
        review,
        locks: new InFlightLocks(),
      }),
      deleteLocalSkill: new DeleteLocalSkill({
        resolveRoot,
        fs,
        git: new HarnessGitAdapter(),
        locks: new InFlightLocks(),
      }),
      restoreSkill: new RestoreSkill({
        resolveRoot,
        fs,
        copyFs: new NodeCopyTreeFs(),
        git: new HarnessGitAdapter(),
        locks: new InFlightLocks(),
      }),
      proposals: new ProposalActions({
        resolveRoot,
        git: new HarnessGitAdapter(),
        review,
      }),
      deployState: stubDeployState({ fs }),
      deploy: stubDeploy({ inventory, registry, locks }),
      remove: stubRemove({ registry, locks }),
      retryOperation: stubRetryOperation({ registry, locks }),
      drift: stubDrift({ registry }),
      resolveGlobalRoot: () => "/nonexistent-apm-root",
      connect: stubConnect(),
      scaffold: stubScaffold(),
      browse: stubBrowse(),
      update: stubUpdate(),
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
    expect(promoted.stages.review).toMatchObject({
      outcome: "read",
      rows: [{ skill: "tdd", status: "pull-request-missing", deletion: false }],
    });
    expect(promoted.stages.proposal).toMatchObject({
      outcome: "read",
      rows: [],
    });

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
    expect(merged.stages.review).toMatchObject({ outcome: "read", rows: [] });
    expect(merged.stages.proposal).toMatchObject({ outcome: "read", rows: [] });
    expect(merged.stages.release).toMatchObject({
      outcome: "read",
      rows: [{ skill: "tdd", status: "changed" }],
    });
    expect(merged.releaseState).toBe("pending-release");
  });

  it("never forces the promote branch, whatever a second press answers", async () => {
    // A reply the browser never saw: the author presses again with nothing
    // changed. The branch already carries this content, so the second press
    // publishes no new commit and never rewrites the branch (#578).
    await writeSkill("tdd", "edited on disk");
    const app = makeApp(root);
    await promote(app, { name: "tdd" });
    const first = await promoted("rev-parse");

    await promote(app, { name: "tdd" });

    expect(await promoted("rev-parse")).toBe(first);
    const state = (await (
      await app.request("/api/harness/refresh", { method: "POST" })
    ).json()) as HarnessState;
    expect(state.stages.review).toMatchObject({
      outcome: "read",
      rows: [{ skill: "tdd", status: "pull-request-missing" }],
    });
  });

  it("refuses a name that is not a skill name, before it reaches git", async () => {
    const response = await promote(makeApp(root), { name: "../etc" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "invalid-skill",
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

  it("states a build failure in Maestro's words, leaking no git output or path", async () => {
    // An ignore rule over the skill's own directory: `git add` stages
    // nothing, so there is no tree to build the commit from. Whatever git
    // says about it is git's to keep — the caller gets a class.
    await writeFile(join(root, ".gitignore"), ".apm/skills/draft/\n", "utf8");
    await writeSkill("draft", "ignored on disk");

    const response = await promote(makeApp(root), { name: "draft" });
    const body = await response.text();

    expect(response.status).toBe(502);
    expect(JSON.parse(body)).toEqual({
      error: "promote-failed",
    });
    expect(body).not.toContain(root);
    expect(body).not.toContain("git");
  });

  it("flags a skill a teammate already changed on GitHub before it is promoted", async () => {
    // The teammate never touches a promote branch — a direct push to the
    // default branch is enough to make replacing it visible (#579).
    const other = join(base, "other");
    await run("git", ["clone", remote, other]);
    await git(other, "config", "user.email", "mate@example.com");
    await git(other, "config", "user.name", "Mate");
    await writeFile(
      join(other, ".apm", "skills", "tdd", "SKILL.md"),
      "---\ndescription: sharpened by a teammate\n---\n",
      "utf8",
    );
    await git(other, "add", ".");
    await git(other, "commit", "-m", "team change");
    await git(other, "push", "origin", "HEAD:main");
    await writeSkill("tdd", "edited on disk");
    const app = makeApp(root);

    const state = (await (
      await app.request("/api/harness/refresh", { method: "POST" })
    ).json()) as HarnessState;

    expect(state.stages.proposal).toMatchObject({
      outcome: "read",
      rows: [
        {
          skill: "tdd",
          status: "not-yet-proposed",
          deletion: false,
          concurrentChange: true,
          remoteTree: expect.any(String),
        },
      ],
    });
  });

  it("shows no concurrent-change warning when nobody else touched the skill", async () => {
    await writeSkill("tdd", "edited on disk");
    const app = makeApp(root);

    const state = (await (
      await app.request("/api/harness/refresh", { method: "POST" })
    ).json()) as HarnessState;

    expect(state.stages.proposal).toMatchObject({
      outcome: "read",
      rows: [
        {
          skill: "tdd",
          status: "not-yet-proposed",
          deletion: false,
          concurrentChange: false,
          remoteTree: expect.any(String),
        },
      ],
    });
  });

  it("refuses to push over a teammate's change its own fetch just found, never silently replacing it", async () => {
    // The teammate's push lands after this test's setup already fetched once —
    // exactly the window between the cockpit's last read and the press. Promote
    // re-fetches on its own, so the refusal must come from that fresh read, not
    // from a stale warning (#579).
    const other = join(base, "other");
    await run("git", ["clone", remote, other]);
    await git(other, "config", "user.email", "mate@example.com");
    await git(other, "config", "user.name", "Mate");
    await writeFile(
      join(other, ".apm", "skills", "tdd", "SKILL.md"),
      "---\ndescription: sharpened by a teammate\n---\n",
      "utf8",
    );
    await git(other, "add", ".");
    await git(other, "commit", "-m", "team change");
    await git(other, "push", "origin", "HEAD:main");
    await writeSkill("tdd", "edited on disk");

    const response = await promote(makeApp(root), { name: "tdd" });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "concurrent-change",
    });
    expect((await git(remote, "branch", "--list", "maestro/tdd")).stdout).toBe(
      "",
    );
  });

  it("still pushes the author's own unpushed commit, never mistaking it for a teammate's", async () => {
    await git(root, "config", "user.email", "test@example.com");
    await git(root, "config", "user.name", "Test");
    await writeSkill("tdd", "committed locally, not yet pushed");
    await git(root, "add", ".");
    await git(root, "commit", "-m", "local-only commit");
    await writeSkill("tdd", "edited further on disk");

    const response = await promote(makeApp(root), { name: "tdd" });

    expect(response.status).toBe(200);
    expect(
      (
        await git(
          remote,
          "show",
          "refs/heads/maestro/tdd:.apm/skills/tdd/SKILL.md",
        )
      ).stdout,
    ).toContain("edited further on disk");
  });

  it("appends a second promotion onto the existing branch", async () => {
    await writeSkill("tdd", "first edit");
    const app = makeApp(root);
    await promote(app, { name: "tdd" });
    const first = await promoted("rev-parse");
    await writeSkill("tdd", "second edit");

    const response = await promote(app, { name: "tdd" });

    expect(response.status).toBe(200);
    const second = await promoted("rev-parse");
    expect(second).not.toBe(first);
    expect(
      (
        await git(remote, "rev-parse", "refs/heads/maestro/tdd~1")
      ).stdout.trim(),
    ).toBe(first);
    expect(
      (
        await git(remote, "rev-list", "--count", "main..refs/heads/maestro/tdd")
      ).stdout.trim(),
    ).toBe("2");
  });

  it("reports success when a promote's reply was lost after the remote already took it", async () => {
    await writeSkill("tdd", "edited on disk");
    const app = makeApp(root);
    await promote(app, { name: "tdd" });

    // A push that errors out after the remote already applied it — a timeout
    // on the way back, a receive-pack that fails at the end (#577).
    const script = join(base, "receive-pack.sh");
    await writeFile(script, '#!/bin/sh\ngit-receive-pack "$@"\nexit 1\n', {
      encoding: "utf8",
      mode: 0o755,
    });
    await git(root, "config", "remote.origin.receivepack", script);
    await writeSkill("tdd", "second edit");

    const response = await promote(app, { name: "tdd" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      branch: "maestro/tdd",
      pullRequestUrl:
        "https://github.com/fimoklei/agent-harness/compare/main...maestro/tdd?expand=1",
    });
    expect(
      (
        await git(remote, "rev-list", "--count", "main..refs/heads/maestro/tdd")
      ).stdout.trim(),
    ).toBe("2");
  });

  it("leaves the repository untouched when a promote push is rejected, and a retry appends cleanly", async () => {
    await writeSkill("tdd", "first edit");
    const app = makeApp(root);
    await promote(app, { name: "tdd" });
    const first = await promoted("rev-parse");

    // A hook that refuses every push, so the rejection is deterministic.
    await writeFile(
      join(remote, "hooks", "pre-receive"),
      "#!/bin/sh\nexit 1\n",
      { mode: 0o755 },
    );
    await writeFile(join(root, "staged.md"), "staged\n", "utf8");
    await git(root, "add", "staged.md");
    const head = (await git(root, "rev-parse", "HEAD")).stdout.trim();
    const status = (await git(root, "status", "--porcelain")).stdout;
    const branches = (await git(root, "branch", "--list")).stdout;
    await writeSkill("tdd", "second edit");

    const response = await promote(app, { name: "tdd" });
    const body = await response.text();

    expect(response.status).toBe(502);
    expect(JSON.parse(body)).toEqual({
      error: "promote-failed",
    });
    expect(body).not.toContain(root);
    expect(body).not.toContain("git");
    expect(await promoted("rev-parse")).toBe(first);
    expect((await git(root, "rev-parse", "HEAD")).stdout.trim()).toBe(head);
    expect((await git(root, "status", "--porcelain")).stdout).toBe(status);
    expect((await git(root, "branch", "--list")).stdout).toBe(branches);

    // Never automatic: this is a fresh press, made by the test.
    await rm(join(remote, "hooks", "pre-receive"));
    const retry = await promote(app, { name: "tdd" });

    expect(retry.status).toBe(200);
    expect(
      (
        await git(remote, "rev-list", "--count", "main..refs/heads/maestro/tdd")
      ).stdout.trim(),
    ).toBe("2");
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

  // Publishing a removal through the route the confirmation presses. The body
  // carries the origin/HEAD tree the author was shown, and nothing else — the
  // harness is still resolved server-side (#580).
  describe("publishing a deletion", () => {
    const publishDeletion = async (
      app: ReturnType<typeof makeApp>,
      body: unknown,
    ) =>
      app.request("/api/harness/promote/deletion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

    // The tree the `deleted locally` row states, read the same way the view
    // reads it: origin/HEAD's own copy of the skill.
    const seenTree = async (app: ReturnType<typeof makeApp>) => {
      await app.request("/api/harness/refresh", { method: "POST" });
      return (await new HarnessGitAdapter().readMovementTrees(root))?.remote
        .tdd as string;
    };

    const deleteOnDisk = async () =>
      rm(join(root, ".apm", "skills", "tdd"), {
        recursive: true,
        force: true,
      });

    it("moves the row to Pending review, and to Pending release once it is merged", async () => {
      const app = makeApp(root);
      const seen = await seenTree(app);
      await deleteOnDisk();

      const response = await publishDeletion(app, {
        name: "tdd",
        seenRemoteTree: seen,
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        branch: "maestro/tdd",
        pullRequestUrl:
          "https://github.com/fimoklei/agent-harness/compare/main...maestro/tdd?expand=1",
      });

      const reviewed = (await (
        await app.request("/api/harness/refresh", { method: "POST" })
      ).json()) as HarnessState;
      expect(reviewed.stages.review).toMatchObject({
        outcome: "read",
        rows: [
          { skill: "tdd", status: "pull-request-missing", deletion: true },
        ],
      });
      expect(seen).toEqual(expect.any(String));

      // Merged the way a reviewer would, in the fixture's own remote.
      await git(
        remote,
        "update-ref",
        "refs/heads/main",
        "refs/heads/maestro/tdd",
      );
      const merged = (await (
        await app.request("/api/harness/refresh", { method: "POST" })
      ).json()) as HarnessState;
      expect(merged.stages.review).toMatchObject({ outcome: "read", rows: [] });
      expect(merged.releaseState).toBe("pending-release");
      expect(merged.stages.release).toMatchObject({
        outcome: "read",
        rows: [{ skill: "tdd", status: "deleted", deletion: true }],
      });
    });

    it("refuses a confirmation given against a tree the remote has moved past", async () => {
      const app = makeApp(root);
      await deleteOnDisk();

      const response = await publishDeletion(app, {
        name: "tdd",
        seenRemoteTree: "0".repeat(40),
      });

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        error: "confirmation-stale",
      });
      expect(
        (await git(remote, "branch", "--list", "maestro/tdd")).stdout,
      ).toBe("");
    });

    it("states an ambiguous working tree in Maestro's words, leaking no git output or path", async () => {
      const app = makeApp(root);
      const seen = await seenTree(app);
      await deleteOnDisk();
      await git(root, "sparse-checkout", "init");

      const response = await publishDeletion(app, {
        name: "tdd",
        seenRemoteTree: seen,
      });
      const body = await response.text();

      expect(response.status).toBe(409);
      expect(JSON.parse(body)).toEqual({
        error: "sparse-checkout",
      });
      expect(body).not.toContain(root);
      expect(
        (await git(remote, "branch", "--list", "maestro/tdd")).stdout,
      ).toBe("");
    });

    it("refuses a body that carries no confirmed tree", async () => {
      const response = await publishDeletion(makeApp(root), { name: "tdd" });

      expect(response.status).toBe(400);
    });
  });
});
