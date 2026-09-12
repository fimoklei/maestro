// Confirming a release, driven through the real Hono app against a real clone
// and a real bare remote. Mirrors server-harness.test.ts's setup so the plan
// and the confirm are proven against the same journey (#520).
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
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
import { stubPromotes } from "../helpers/stub-promote";
import { stubRemove } from "../helpers/stub-remove";
import { stubReview } from "../helpers/stub-review";
import { stubScaffold } from "../helpers/stub-scaffold";

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
    await removeGitTempTree(base);
  });

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
    const resolveRoot = async () =>
      harnessPath === undefined ? undefined : await fs.realpath(harnessPath);
    const harness = new ReadHarnessState({
      resolveRoot,
      git: new HarnessGitAdapter(),
      freshness: new HarnessFreshnessStore({ store }),
      review: stubReview(),
    });
    return createApp({
      importSkill: stubImport(),
      registry,
      inventory,
      harness,
      publish: new PublishRelease({
        resolveRoot,
        git: new HarnessGitAdapter(),
        freshness: new HarnessFreshnessStore({ store }),
        replan: (root) => harness.planReleaseAt(root),
        locks: new InFlightLocks(),
      }),
      ...stubPromotes(),
      deployState: stubDeployState({ fs }),
      deploy: stubDeploy({ inventory, registry, locks }),
      remove: stubRemove({ registry, locks }),
      retryOperation: stubRetryOperation({ registry, locks }),
      drift: stubDrift({ registry }),
      resolveGlobalRoot: () => "/nonexistent-apm-root",
      connect: stubConnect(),
      scaffold: stubScaffold(),
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

  const headOf = async (cwd: string) =>
    (await git(cwd, "rev-parse", "HEAD")).stdout.trim();

  // A teammate's clone, pushing onto the same bare remote. This is the race
  // every refusal below is about: someone else moved the branch or took the
  // version between the author's plan and their confirmation (#521).
  const teammate = async () => {
    const other = join(base, "other");
    await run("git", ["clone", remote, other]);
    await git(other, "config", "user.email", "mate@example.com");
    await git(other, "config", "user.name", "Mate");
    return other;
  };

  // Runs on the remote's side of the push, before it advertises its refs — the
  // only place to stage a name taken after this confirmation's own fetch has
  // already answered. `"$@"` forwards the repository git passes in.
  const takeTagDuringPush = async (name: string, commit: string) => {
    const script = join(base, "receive-pack.sh");
    await writeFile(
      script,
      `#!/bin/sh\ngit --git-dir="${remote}" tag ${name} ${commit}\nexec git-receive-pack "$@"\n`,
      { encoding: "utf8", mode: 0o755 },
    );
    await git(root, "config", "remote.origin.receivepack", script);
  };

  // Exactly what the dialog holds and echoes back: the three fields the
  // confirmation is checked against. Captured before a race is staged, so a
  // test sends the plan the author actually saw.
  const capturePlan = async (app: ReturnType<typeof makeApp>) => {
    const plan = (await (
      await app.request("/api/harness/release-plan")
    ).json()) as {
      previousTag: string | null;
      previousTagCommit: string | null;
      revision: string;
    };
    return {
      previousTag: plan.previousTag,
      previousTagCommit: plan.previousTagCommit,
      revision: plan.revision,
    };
  };

  it("confirms a patch release at the freshly read revision", async () => {
    const app = makeApp(root);
    await app.request("/api/harness/refresh", { method: "POST" });
    const head = await headOf(root);

    const res = await publish(app, {
      step: "patch",
      ...(await capturePlan(app)),
    });

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

    await publish(app, {
      step: "patch",
      ...(await capturePlan(app)),
    });
    const res = await app.request("/api/harness");

    await expect(res.json()).resolves.toMatchObject({
      releasedVersion: "v0.1.1",
      releaseState: "released",
    });
  });

  it("leaves the author's checkout, index, and staged work untouched", async () => {
    const app = makeApp(root);
    await app.request("/api/harness/refresh", { method: "POST" });
    const before = await headOf(root);
    await writeFile(join(root, "wip.md"), "work in progress\n", "utf8");
    await git(root, "add", "wip.md");

    await publish(app, {
      step: "patch",
      ...(await capturePlan(app)),
    });

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
      ...(await capturePlan(app)),
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
      previousTagCommit: await headOf(root),
      revision: await headOf(root),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("invalid-body");
  });

  it("rejects a confirmation that names no revision at all", async () => {
    const app = makeApp(root);

    const res = await publish(app, { step: "patch", previousTag: "v0.1.0" });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("invalid-body");
  });

  it("refuses a confirmation whose previous tag no longer matches the remote", async () => {
    const app = makeApp(root);
    await app.request("/api/harness/refresh", { method: "POST" });

    const res = await publish(app, {
      step: "patch",
      previousTag: "v9.9.9",
      previousTagCommit: await headOf(root),
      revision: await headOf(root),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("plan-changed");
  });

  it("refuses with a readable error when no harness is connected", async () => {
    const app = makeApp(undefined);

    const res = await publish(app, {
      step: "patch",
      previousTag: "v0.1.0",
      previousTagCommit: "0".repeat(40),
      revision: "0".repeat(40),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("not-configured");
  });

  describe("a remote that moved under the plan", () => {
    // The author opened a plan, a teammate pushed, and only then did the
    // author confirm. Every case answers with the plan that replaces the one
    // being refused, so the dialog can take a new confirmation (#521).
    type Refusal = {
      error: string;
      message: string;
      plan?: {
        previousTag: string | null;
        previousTagCommit: string | null;
        revision: string;
      };
    };

    it("refuses a plan the branch tip has moved past, and recomputes it", async () => {
      const app = makeApp(root);
      await app.request("/api/harness/refresh", { method: "POST" });
      const plan = await capturePlan(app);
      const other = await teammate();
      await writeFile(join(other, "theirs.md"), "theirs\n", "utf8");
      await git(other, "add", ".");
      await git(other, "commit", "-m", "their commit");
      await git(other, "push", "origin", "HEAD:main");

      const res = await publish(app, {
        step: "patch",
        ...plan,
      });

      expect(res.status).toBe(409);
      const body = (await res.json()) as Refusal;
      expect(body.error).toBe("plan-changed");
      expect(body.plan?.revision).toBe(await headOf(other));
      await expect(
        git(remote, "rev-parse", "refs/tags/v0.1.1"),
      ).rejects.toThrow();
    });

    it("refuses a plan a higher tag appeared under, and recomputes from that tag", async () => {
      const app = makeApp(root);
      await app.request("/api/harness/refresh", { method: "POST" });
      const plan = await capturePlan(app);
      const other = await teammate();
      await git(other, "tag", "v0.2.0");
      await git(other, "push", "--tags", "origin");

      const res = await publish(app, {
        step: "patch",
        ...plan,
      });

      expect(res.status).toBe(409);
      const body = (await res.json()) as Refusal;
      expect(body.error).toBe("plan-changed");
      expect(body.plan?.previousTag).toBe("v0.2.0");
    });

    it("refuses a plan whose previous tag was force-moved under the same name", async () => {
      // The version numbers all still line up — only the commit the previous
      // release points at has changed, and with it the delta the author read.
      const app = makeApp(root);
      await app.request("/api/harness/refresh", { method: "POST" });
      const plan = await capturePlan(app);
      const other = await teammate();
      await git(other, "checkout", "-b", "side");
      await writeFile(join(other, "side.md"), "side\n", "utf8");
      await git(other, "add", ".");
      await git(other, "commit", "-m", "side commit");
      await git(other, "tag", "-f", "v0.1.0");
      await git(other, "push", "--force", "origin", "HEAD:refs/heads/side");
      await git(other, "push", "--force", "--tags", "origin");

      const res = await publish(app, { step: "patch", ...plan });

      expect(res.status).toBe(409);
      const body = (await res.json()) as Refusal;
      expect(body.error).toBe("plan-changed");
      expect(body.plan?.previousTag).toBe("v0.1.0");
      expect(body.plan?.previousTagCommit).toBe(await headOf(other));
      await expect(
        git(remote, "rev-parse", "refs/tags/v0.1.1"),
      ).rejects.toThrow();
    });

    it("refuses a confirmation whose own version the remote already carries", async () => {
      // The tag the plan proposes is taken, but the tip has not moved: the
      // fetch at confirmation time sees it, so the push is never asked.
      const app = makeApp(root);
      await app.request("/api/harness/refresh", { method: "POST" });
      const plan = await capturePlan(app);
      const other = await teammate();
      await git(other, "tag", "v0.1.1");
      await git(other, "push", "--tags", "origin");

      const res = await publish(app, {
        step: "patch",
        ...plan,
      });

      expect(res.status).toBe(409);
      const body = (await res.json()) as Refusal;
      expect(body.error).toBe("plan-changed");
      expect(body.plan?.previousTag).toBe("v0.1.1");
    });

    it("reports a version taken after this confirmation's own read as retryable", async () => {
      // The name is taken between this confirmation's fetch and its push — the
      // window no read can close. A normal outcome: nothing was overwritten,
      // and the reply carries the plan to confirm instead (#521).
      // A commit off the default branch, so the remote has something other
      // than the tip for the name to be taken at. The tip itself never moves,
      // which is what keeps the plan valid right up to the push.
      const other = await teammate();
      await git(other, "checkout", "-b", "side");
      await writeFile(join(other, "side.md"), "side\n", "utf8");
      await git(other, "add", ".");
      await git(other, "commit", "-m", "side commit");
      await git(other, "push", "origin", "HEAD:refs/heads/side");
      const sideCommit = await headOf(other);

      const app = makeApp(root);
      await app.request("/api/harness/refresh", { method: "POST" });
      const plan = await capturePlan(app);
      // The remote takes the name mid-push, after this confirmation's own
      // fetch has already answered. Only a hook inside the push can stage
      // that: no read, however fresh, can see it coming.
      await takeTagDuringPush("v0.1.1", sideCommit);

      const res = await publish(app, {
        step: "patch",
        ...plan,
      });

      expect(res.status).toBe(409);
      const body = (await res.json()) as Refusal;
      expect(body.error).toBe("already-released");
      expect(body.plan?.previousTag).toBe("v0.1.1");
      // Someone else's tag stands exactly where they put it.
      expect(
        (await git(remote, "rev-parse", "refs/tags/v0.1.1")).stdout.trim(),
      ).toBe(sideCommit);
    });

    it("names no path, remote, or git output in a refusal", async () => {
      const app = makeApp(root);
      await app.request("/api/harness/refresh", { method: "POST" });

      const res = await publish(app, {
        step: "patch",
        previousTag: "v9.9.9",
        previousTagCommit: await headOf(root),
        revision: await headOf(root),
      });

      const text = await res.text();
      expect(text).not.toContain(root);
      expect(text).not.toContain(remote);
      expect(text).not.toContain(ORIGIN_URL);
      expect(text).not.toMatch(/rejected|refs\/|stderr|fatal|error:/i);
    });
  });

  describe("a push the remote refused outright", () => {
    // Refuses the push and nothing else: fetching and `ls-remote` still work,
    // so this is a failed push rather than an unreachable harness.
    const refusePush = async () => {
      const script = join(base, "refuse.sh");
      await writeFile(script, "#!/bin/sh\nexit 1\n", {
        encoding: "utf8",
        mode: 0o755,
      });
      await git(root, "config", "remote.origin.receivepack", script);
    };

    it("leaves no local tag behind, and every commit and byte in place", async () => {
      const app = makeApp(root);
      await app.request("/api/harness/refresh", { method: "POST" });
      const before = await headOf(root);
      await writeFile(join(root, "wip.md"), "work in progress\n", "utf8");
      await git(root, "add", "wip.md");
      await writeFile(join(root, "untracked.md"), "loose\n", "utf8");
      await refusePush();

      const res = await publish(app, {
        step: "patch",
        ...(await capturePlan(app)),
      });

      expect(res.status).toBe(502);
      // The one refusal that starts life as a git error: whatever git wrote to
      // stderr must not reach the browser (security.md).
      const text = await res.clone().text();
      expect(text).not.toContain(root);
      expect(text).not.toContain(remote);
      expect(text).not.toMatch(/rejected|refs\/|stderr|fatal|error:/i);
      await expect(
        git(remote, "rev-parse", "refs/tags/v0.1.1"),
      ).rejects.toThrow();
      expect((await git(root, "tag", "--list")).stdout).not.toContain("v0.1.1");
      expect(await headOf(root)).toBe(before);
      const status = (await git(root, "status", "--porcelain")).stdout;
      expect(status).toContain("A  wip.md");
      expect(status).toContain("?? untracked.md");
    });
  });

  describe("a harness whose default branch is not main", () => {
    // `git init -b main` above is a convention, not a promise: nothing in the
    // release path may assume the branch is called main (#521).
    beforeEach(async () => {
      await git(root, "branch", "-m", "main", "trunk");
      await git(root, "push", "origin", "HEAD:trunk");
      await run("git", [
        "-C",
        remote,
        "symbolic-ref",
        "HEAD",
        "refs/heads/trunk",
      ]);
      await run("git", ["-C", remote, "branch", "-D", "main"]);
      await new HarnessGitAdapter().fetch(root);
    }, 30_000);

    it("tags the tip of whatever branch the remote calls default", async () => {
      const app = makeApp(root);
      await app.request("/api/harness/refresh", { method: "POST" });
      const head = await headOf(root);

      const res = await publish(app, {
        step: "patch",
        ...(await capturePlan(app)),
      });

      expect(res.status).toBe(200);
      expect(
        (await git(remote, "rev-parse", "refs/tags/v0.1.1")).stdout.trim(),
      ).toBe(head);
      await expect(res.json()).resolves.toMatchObject({ revision: head });
    });
  });

  describe("tags outside the default branch's history", () => {
    // A release tag is the highest `vX.Y.Z` wherever it points — tags are
    // neither attributed nor filtered by reachability (ADR-0021). A tag on an
    // unmerged side branch therefore still prices the next release.
    beforeEach(async () => {
      const other = await teammate();
      await git(other, "checkout", "-b", "side");
      await writeFile(join(other, "side.md"), "side\n", "utf8");
      await git(other, "add", ".");
      await git(other, "commit", "-m", "side commit");
      await git(other, "tag", "v0.4.0");
      await git(other, "push", "--tags", "origin", "HEAD:refs/heads/side");
      await new HarnessGitAdapter().fetch(root);
    }, 30_000);

    it("prices the release from a tag the default branch cannot reach", async () => {
      const app = makeApp(root);
      await app.request("/api/harness/refresh", { method: "POST" });
      const head = await headOf(root);

      const res = await publish(app, {
        step: "patch",
        ...(await capturePlan(app)),
      });

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        tag: "v0.4.1",
        revision: head,
      });
      // Tagged at the default branch's tip, never at the side branch the
      // previous tag sits on.
      expect(
        (await git(remote, "rev-parse", "refs/tags/v0.4.1")).stdout.trim(),
      ).toBe(head);
    });

    it("refuses a confirmation still priced from the reachable tag", async () => {
      const app = makeApp(root);
      await app.request("/api/harness/refresh", { method: "POST" });

      const res = await publish(app, {
        step: "patch",
        previousTag: "v0.1.0",
        previousTagCommit: await headOf(root),
        revision: await headOf(root),
      });

      expect(res.status).toBe(409);
      const body = (await res.json()) as {
        error: string;
        plan?: { previousTag: string | null };
      };
      expect(body.error).toBe("plan-changed");
      expect(body.plan?.previousTag).toBe("v0.4.0");
    });
  });
});
