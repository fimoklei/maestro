// The three stages through the real Hono app, a real clone and a real bare
// remote, with GitHub's side controlled at the port rather than by an account
// (#827 — Testing Decisions). Git says what the content is; the stub says what
// the team did with it.
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  NodeFileSystem,
  PromoteSkill,
  PromoteSkillDeletion,
  ProposalActions,
  ReadHarnessState,
  type ReviewRequest,
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
import { stubPublish } from "../helpers/stub-publish";
import { stubRemove } from "../helpers/stub-remove";
import { stubReview } from "../helpers/stub-review";
import { stubScaffold } from "../helpers/stub-scaffold";

const run = promisify(execFile);

const ORIGIN_URL = "https://github.com/fimoklei/agent-harness.git";

const request = (over: Partial<ReviewRequest> = {}): ReviewRequest => ({
  number: 45,
  url: "https://github.com/fimoklei/agent-harness/pull/45",
  state: "open",
  draft: false,
  decision: null,
  reviewers: [],
  headOwner: "fimoklei",
  headRepo: "agent-harness",
  headBranch: "maestro/tdd",
  headCommit: "3d0f1a9c5b7e2846f0a1c3d5e7b9081726354adf",
  baseBranch: "main",
  ...over,
});

describe("harness stages over HTTP", { timeout: 40_000 }, () => {
  let base: string;
  let remote: string;
  let root: string;
  let review: ReturnType<typeof stubReview>;

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
    base = await mkdtemp(join(tmpdir(), "maestro-server-stages-"));
    remote = join(base, "remote.git");
    root = join(base, "clone");
    review = stubReview();
    await run("git", ["init", "--bare", "-b", "main", remote]);
    await run("git", ["clone", remote, root]);
    await git(root, "config", "user.email", "test@example.com");
    await git(root, "config", "user.name", "Test");
    // The GitHub origin resolves to the bare repo next door, so the suite stays
    // offline while the origin still parses as GitHub (LEARNINGS ·
    // git-remote-get-url).
    await git(root, "config", `url.${remote}.insteadOf`, ORIGIN_URL);
    await git(root, "remote", "set-url", "origin", ORIGIN_URL);
    await writeSkill("tdd", "as published");
    await writeFile(join(root, "apm.yml"), "name: agent-harness\n", "utf8");
    await git(root, "add", ".");
    await git(root, "commit", "-m", "first skill");
    await git(root, "tag", "v0.1.0");
    await git(root, "push", "--tags", "origin", "HEAD:main");
    await new HarnessGitAdapter().fetch(root);
  }, 40_000);

  afterEach(async () => {
    await removeGitTempTree(base);
  });

  function makeApp() {
    const fs = new NodeFileSystem();
    const configPath = join(base, "config.json");
    const registry = realRegistry(fs, configPath);
    const store = new ConfigStore({ fs, configPath: () => configPath });
    const inventory = new InventoryReader({
      fs,
      resolvePath: () => root,
      // The real released read: these suites build real repositories,
      // so Inventory answers from `refs/maestro/tags` as it does live (#841).
      readReleasedSkills: releasedSkillsFromGit(new HarnessGitAdapter()),
    });
    const locks = new InFlightLocks();
    const resolveRoot = async () => await fs.realpath(root);
    return createApp({
      importSkill: stubImport(),
      registry,
      inventory,
      harness: new ReadHarnessState({
        resolveRoot,
        git: new HarnessGitAdapter(),
        freshness: new HarnessFreshnessStore({ store }),
        review,
      }),
      publish: stubPublish(),
      promote: new PromoteSkill({
        resolveRoot,
        git: new HarnessGitAdapter(),
        freshness: new HarnessFreshnessStore({ store }),
        review,
        locks,
      }),
      promoteDeletion: new PromoteSkillDeletion({
        resolveRoot,
        git: new HarnessGitAdapter(),
        freshness: new HarnessFreshnessStore({ store }),
        review,
        locks,
      }),
      deleteLocalSkill: new DeleteLocalSkill({
        resolveRoot,
        fs,
        git: new HarnessGitAdapter(),
        locks,
      }),
      proposals: new ProposalActions({
        resolveRoot,
        git: new HarnessGitAdapter(),
        review,
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

  type App = ReturnType<typeof makeApp>;

  const refresh = async (app: App): Promise<HarnessState> =>
    (await (
      await app.request("/api/harness/refresh", { method: "POST" })
    ).json()) as HarnessState;

  const read = async (app: App): Promise<HarnessState> =>
    (await (await app.request("/api/harness")).json()) as HarnessState;

  const promote = (app: App, name: string) =>
    app.request("/api/harness/promote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });

  const proposalAction = (
    app: App,
    action: "create" | "reopen" | "withdraw",
    body: Record<string, unknown>,
  ) =>
    app.request(`/api/harness/proposal/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  const rowsOf = (stage: HarnessState["stages"]["proposal"]) =>
    stage.outcome === "read" ? stage.rows : [];

  const branchTree = async (name: string) =>
    (
      await git(root, "rev-parse", `refs/remotes/origin/maestro/${name}^{tree}`)
    ).stdout.trim();

  const answer = (requests: ReviewRequest[]) =>
    review.answer({ outcome: "read", requests, complete: true, limit: 100 });

  it("carries a skill through proposal, review and release as three separate rows", async () => {
    // Local edit → prepared proposal → an open request → a further local edit,
    // with the first change already merged: one skill, three pieces of work.
    const app = makeApp();
    await writeSkill("tdd", "first change");
    await promote(app, "tdd");
    review.answer({
      outcome: "read",
      requests: [request()],
      complete: true,
      limit: 100,
    });
    // The reviewer merges the proposal in the fixture's own remote.
    await git(
      remote,
      "update-ref",
      "refs/heads/main",
      "refs/heads/maestro/tdd",
    );
    // …and the author keeps editing afterwards.
    await writeSkill("tdd", "second change");

    const state = await refresh(app);

    expect(rowsOf(state.stages.proposal)).toMatchObject([
      { skill: "tdd", status: "new-local-work" },
    ]);
    expect(rowsOf(state.stages.review)).toMatchObject([
      { skill: "tdd", status: "waiting-for-review" },
    ]);
    expect(rowsOf(state.stages.release)).toMatchObject([
      { skill: "tdd", status: "changed" },
    ]);
    // Every row names the other two, in journey order.
    expect(rowsOf(state.stages.proposal)[0]?.alsoIn).toEqual([
      "pending-review",
      "pending-release",
    ]);
  });

  it("keeps the pull-request URL across a fresh read, never in the browser", async () => {
    const app = makeApp();
    await writeSkill("tdd", "edited on disk");
    await promote(app, "tdd");
    review.answer({
      outcome: "read",
      requests: [request()],
      complete: true,
      limit: 100,
    });
    await refresh(app);

    // A second client, with nothing carried over from the first.
    const again = await read(makeApp());

    expect(rowsOf(again.stages.review)).toMatchObject([
      {
        skill: "tdd",
        requests: [
          {
            number: 45,
            url: "https://github.com/fimoklei/agent-harness/pull/45",
          },
        ],
      },
    ]);
  });

  it("never reads a pushed branch alone as an open review", async () => {
    const app = makeApp();
    await writeSkill("tdd", "edited on disk");
    await promote(app, "tdd");

    const state = await refresh(app);

    expect(rowsOf(state.stages.review)).toMatchObject([
      { skill: "tdd", status: "pull-request-missing", requests: [] },
    ]);
  });

  it("reads a closed proposal whose content never merged as recoverable", async () => {
    const app = makeApp();
    await writeSkill("tdd", "edited on disk");
    await promote(app, "tdd");
    review.answer({
      outcome: "read",
      requests: [request({ state: "closed" })],
      complete: true,
      limit: 100,
    });

    const state = await refresh(app);

    expect(rowsOf(state.stages.review)).toMatchObject([
      { skill: "tdd", status: "proposal-closed" },
    ]);
  });

  it("exposes every matching request instead of choosing one", async () => {
    const app = makeApp();
    await writeSkill("tdd", "edited on disk");
    await promote(app, "tdd");
    review.answer({
      outcome: "read",
      requests: [
        request({
          number: 41,
          url: "https://github.com/fimoklei/agent-harness/pull/41",
        }),
        request({
          number: 44,
          url: "https://github.com/fimoklei/agent-harness/pull/44",
        }),
      ],
      complete: true,
      limit: 100,
    });

    const state = await refresh(app);

    expect(rowsOf(state.stages.review)).toMatchObject([
      {
        status: "multiple-pull-requests",
        requests: [{ number: 41 }, { number: 44 }],
      },
    ]);
  });

  it("puts a draft ahead of a requested change, and names the reviewers", async () => {
    const app = makeApp();
    await writeSkill("tdd", "edited on disk");
    await promote(app, "tdd");
    review.answer({
      outcome: "read",
      requests: [
        request({
          draft: true,
          decision: "changes-requested",
          reviewers: [
            { kind: "user", login: "ada" },
            { kind: "team", slug: "fimoklei/reviewers" },
          ],
        }),
      ],
      complete: true,
      limit: 100,
    });

    const state = await refresh(app);

    expect(rowsOf(state.stages.review)).toMatchObject([
      {
        status: "draft",
        reviewers: [
          { kind: "user", login: "ada" },
          { kind: "team", slug: "fimoklei/reviewers" },
        ],
      },
    ]);
  });

  it("never matches a request opened from a foreign head or into another base", async () => {
    const app = makeApp();
    await writeSkill("tdd", "edited on disk");
    await promote(app, "tdd");
    review.answer({
      outcome: "read",
      requests: [
        request({ headOwner: "someone-else" }),
        request({ number: 46, baseBranch: "release" }),
      ],
      complete: true,
      limit: 100,
    });

    const state = await refresh(app);

    expect(rowsOf(state.stages.review)).toMatchObject([
      { status: "pull-request-missing", requests: [] },
    ]);
  });

  it("leaves the git stages readable when GitHub cannot be asked", async () => {
    const app = makeApp();
    await writeSkill("tdd", "edited on disk");
    review.answer({ outcome: "unavailable" });

    const state = await refresh(app);

    expect(rowsOf(state.stages.proposal)).toMatchObject([
      { skill: "tdd", status: "not-yet-proposed" },
    ]);
    expect(state.stages.review).toEqual({ outcome: "unavailable" });
    expect(state.stages.release.outcome).toBe("read");
    // Membership is unknown, so no row claims to be the only one.
    expect(rowsOf(state.stages.proposal)[0]?.alsoIn).toBeNull();
  });

  it("keeps a local deletion out of another stage's reading", async () => {
    const app = makeApp();
    // A change that merged, and then the author deletes the skill locally.
    await writeSkill("tdd", "merged change");
    await git(root, "add", ".");
    await git(root, "commit", "-m", "second");
    await git(root, "push", "origin", "HEAD:main");
    await new HarnessGitAdapter().fetch(root);
    await rm(join(root, ".apm", "skills", "tdd"), {
      recursive: true,
      force: true,
    });

    const state = await refresh(app);

    expect(rowsOf(state.stages.proposal)).toMatchObject([
      { skill: "tdd", status: "deleted-locally", deletion: true },
    ]);
    expect(rowsOf(state.stages.release)).toMatchObject([
      { skill: "tdd", status: "changed", deletion: false },
    ]);
  });

  it("asks GitHub once per read, about the Harness's own repository", async () => {
    await refresh(makeApp());

    expect(review.asked).toEqual(["fimoklei/agent-harness"]);
  });

  // A deletion is the same journey as a change: the same stages, the same
  // recovery actions, and no shortcut past review (#847).
  describe("a deletion through the journey", () => {
    const deletion = (app: App, name: string, seenRemoteTree: string) =>
      app.request("/api/harness/promote/deletion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, seenRemoteTree }),
      });

    const primitiveNames = async (app: App): Promise<string[]> => {
      const body = (await (
        await app.request("/api/inventory/primitives")
      ).json()) as { primitives: { name: string }[] };
      return body.primitives.map((each) => each.name);
    };

    // Deletes the skill from the working tree only: local HEAD still tracks it,
    // which is what makes this a deletion rather than a skill that was never here.
    const deleteOnDisk = async (name: string) =>
      await rm(join(root, ".apm", "skills", name), {
        recursive: true,
        force: true,
      });

    // Takes the deletion all the way to an open request, the state the
    // restoration and withdrawal cases below start from.
    const proposeDeletion = async (app: App) => {
      await deleteOnDisk("tdd");
      const before = await refresh(app);
      const [proposed] = rowsOf(before.stages.proposal);
      const response = await deletion(app, "tdd", proposed?.remoteTree ?? "");
      expect(response.status).toBe(200);
      answer([request()]);
      return proposed;
    };

    it("moves a local deletion into review as a deletion of its own", async () => {
      const app = makeApp();

      const proposed = await proposeDeletion(app);

      expect(proposed).toMatchObject({
        status: "deleted-locally",
        deletion: true,
      });
      expect(review.created).toEqual([
        {
          head: "maestro/tdd",
          base: "main",
          title: "Promote skill: tdd",
          body: "Proposed from the Maestro cockpit.",
        },
      ]);
      const state = await refresh(app);
      // The work left Pending proposal for Pending review, as an edit does.
      expect(rowsOf(state.stages.proposal)).toEqual([]);
      expect(rowsOf(state.stages.review)).toMatchObject([
        { skill: "tdd", status: "waiting-for-review", deletion: true },
      ]);
    });

    it("sends a restored skill to the same proposal through Update proposal", async () => {
      const app = makeApp();
      await proposeDeletion(app);
      review.created.length = 0;
      // The author changes their mind and puts the skill back.
      await writeSkill("tdd", "as published");

      const waiting = await refresh(app);
      expect(rowsOf(waiting.stages.proposal)).toMatchObject([
        { skill: "tdd", status: "new-local-work", deletion: false },
      ]);

      expect((await promote(app, "tdd")).status).toBe(200);

      // The same branch carries the skill again, and no second request opened.
      expect(review.created).toEqual([]);
      const state = await refresh(app);
      expect(rowsOf(state.stages.proposal)).toEqual([]);
      expect(rowsOf(state.stages.review)).toMatchObject([
        { skill: "tdd", status: "waiting-for-review", deletion: false },
      ]);
    });

    it("withdraws a deletion proposal the way it withdraws a change", async () => {
      const app = makeApp();
      await proposeDeletion(app);

      const response = await proposalAction(app, "withdraw", {
        name: "tdd",
        number: 45,
      });

      expect(response.status).toBe(200);
      expect(review.closed).toEqual([45]);
      // The branch and the local deletion both stand: withdrawing closes the
      // request, never the author's work.
      expect(await branchTree("tdd")).toBeTruthy();
    });

    it("blocks a deletion where two requests match the branch", async () => {
      const app = makeApp();
      await deleteOnDisk("tdd");
      const before = await refresh(app);
      answer([request({ number: 41 }), request({ number: 44 })]);

      const response = await deletion(
        app,
        "tdd",
        rowsOf(before.stages.proposal)[0]?.remoteTree ?? "",
      );

      expect(await response.json()).toEqual({ error: "extra-requests" });
      expect(review.created).toEqual([]);
    });

    it("drops the Inventory row once the deletion is released, leaving deployed copies alone", async () => {
      const app = makeApp();
      // A consuming repo with a deployed copy of the skill, known to Maestro.
      const consumer = join(base, "consumer");
      const deployed = join(consumer, ".claude", "skills", "tdd", "SKILL.md");
      await mkdir(join(consumer, ".claude", "skills", "tdd"), {
        recursive: true,
      });
      await writeFile(deployed, "deployed copy\n", "utf8");
      expect(
        (
          await app.request("/api/registry/repos", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ path: consumer }),
          })
        ).status,
      ).toBe(201);
      expect(await primitiveNames(app)).toEqual(["tdd"]);

      // The deletion merges onto the default branch.
      await deleteOnDisk("tdd");
      await git(root, "add", "-A");
      await git(root, "commit", "-m", "delete tdd");
      await git(root, "push", "origin", "HEAD:main");
      await new HarnessGitAdapter().fetch(root);

      const merged = await refresh(app);
      expect(rowsOf(merged.stages.release)).toMatchObject([
        { skill: "tdd", status: "deleted", deletion: true },
      ]);
      // Merged is not released: Inventory still ships what v0.1.0 published.
      expect(await primitiveNames(app)).toEqual(["tdd"]);

      await git(root, "tag", "v0.2.0");
      await git(root, "push", "--tags", "origin", "HEAD:main");
      await new HarnessGitAdapter().fetch(root);

      const released = await refresh(app);
      expect(await primitiveNames(app)).toEqual([]);
      expect(rowsOf(released.stages.release)).toEqual([]);
      // Releasing publishes; it never reaches into a consuming repo.
      await expect(readFile(deployed, "utf8")).resolves.toBe("deployed copy\n");
    });
  });

  describe("proposal actions", () => {
    it("opens a pull request over the branch Propose change pushed", async () => {
      const app = makeApp();
      await writeSkill("tdd", "edited on disk");

      expect((await promote(app, "tdd")).status).toBe(200);

      expect(review.created).toEqual([
        {
          head: "maestro/tdd",
          base: "main",
          title: "Promote skill: tdd",
          body: "Proposed from the Maestro cockpit.",
        },
      ]);
    });

    it("sends an update to the same proposal, leaving GitHub's request alone", async () => {
      const app = makeApp();
      await writeSkill("tdd", "first change");
      await promote(app, "tdd");
      const first = await branchTree("tdd");
      answer([request({ decision: "changes-requested" })]);
      review.created.length = 0;
      await writeSkill("tdd", "answering the review");

      expect((await promote(app, "tdd")).status).toBe(200);

      // New content on the same branch, and no second request opened — which
      // is what leaves GitHub's verdict standing (#827 · user story 14).
      expect(await branchTree("tdd")).not.toBe(first);
      expect(review.created).toEqual([]);
      const state = await refresh(app);
      expect(rowsOf(state.stages.review)).toMatchObject([
        { status: "changes-requested", requests: [{ number: 45 }] },
      ]);
    });

    it("creates the missing request from the prepared branch, without newer edits", async () => {
      const app = makeApp();
      await writeSkill("tdd", "prepared for review");
      await promote(app, "tdd");
      const prepared = await branchTree("tdd");
      review.created.length = 0;
      // The author keeps editing after preparing. Create pull request must
      // not carry this along (#827 · user story 19).
      await writeSkill("tdd", "not sent yet");

      const response = await proposalAction(app, "create", { name: "tdd" });

      expect(response.status).toBe(200);
      expect(review.created).toEqual([
        {
          head: "maestro/tdd",
          base: "main",
          title: "Promote skill: tdd",
          body: "Proposed from the Maestro cockpit.",
        },
      ]);
      expect(await branchTree("tdd")).toBe(prepared);
    });

    it("refuses to create a second request over a branch that already has one", async () => {
      const app = makeApp();
      await writeSkill("tdd", "edited on disk");
      await promote(app, "tdd");
      answer([request()]);
      review.created.length = 0;

      const response = await proposalAction(app, "create", { name: "tdd" });

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "request-exists" });
      expect(review.created).toEqual([]);
    });

    it("reopens the closed proposal the row named", async () => {
      const app = makeApp();
      await writeSkill("tdd", "edited on disk");
      await promote(app, "tdd");
      answer([request({ state: "closed" })]);

      const response = await proposalAction(app, "reopen", {
        name: "tdd",
        number: 45,
      });

      expect(response.status).toBe(200);
      expect(review.reopened).toEqual([45]);
    });

    it("refuses to reopen a merged request on a reused branch", async () => {
      // An old merged request over this branch says nothing about the content
      // pushed onto it since (ADR-0021, gh-driver.md).
      const app = makeApp();
      await writeSkill("tdd", "edited on disk");
      await promote(app, "tdd");
      answer([request({ state: "merged" })]);

      const response = await proposalAction(app, "reopen", {
        name: "tdd",
        number: 45,
      });

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "request-gone" });
      expect(review.reopened).toEqual([]);
    });

    it("withdraws the open proposal, keeping the branch and the local files", async () => {
      const app = makeApp();
      await writeSkill("tdd", "edited on disk");
      await promote(app, "tdd");
      const prepared = await branchTree("tdd");
      answer([request()]);

      const response = await proposalAction(app, "withdraw", {
        name: "tdd",
        number: 45,
      });

      expect(response.status).toBe(200);
      expect(review.closed).toEqual([45]);
      expect(await branchTree("tdd")).toBe(prepared);
      await expect(
        readFile(join(root, ".apm", "skills", "tdd", "SKILL.md"), "utf8"),
      ).resolves.toContain("edited on disk");
    });

    it("blocks update and withdrawal while two requests match the branch", async () => {
      const app = makeApp();
      await writeSkill("tdd", "edited on disk");
      await promote(app, "tdd");
      const prepared = await branchTree("tdd");
      answer([request({ number: 41 }), request({ number: 44 })]);
      await writeSkill("tdd", "a further edit");

      const update = await promote(app, "tdd");
      const withdrawal = await proposalAction(app, "withdraw", {
        name: "tdd",
        number: 41,
      });

      expect(await update.json()).toEqual({ error: "extra-requests" });
      expect(await withdrawal.json()).toEqual({ error: "extra-requests" });
      expect(await branchTree("tdd")).toBe(prepared);
      expect(review.closed).toEqual([]);
    });

    it("refuses a number the fresh read no longer matches to this skill", async () => {
      // The browser's picture is a claim, never an authorisation: GitHub is
      // re-read before anything is closed (#827).
      const app = makeApp();
      await writeSkill("tdd", "edited on disk");
      await promote(app, "tdd");
      answer([request({ number: 44 })]);

      const response = await proposalAction(app, "withdraw", {
        name: "tdd",
        number: 45,
      });

      expect(response.status).toBe(409);
      expect(review.closed).toEqual([]);
    });

    it("acts on no request opened from another head or into another base", async () => {
      const app = makeApp();
      await writeSkill("tdd", "edited on disk");
      await promote(app, "tdd");
      answer([
        request({ headOwner: "someone-else" }),
        request({ number: 46, headOwner: null, headRepo: null }),
        request({ number: 47, baseBranch: "release" }),
      ]);

      const response = await proposalAction(app, "withdraw", {
        name: "tdd",
        number: 45,
      });

      expect(await response.json()).toEqual({ error: "request-gone" });
      expect(review.closed).toEqual([]);
    });

    it("acts on a teammate's request over the same branch", async () => {
      // Author identity restricts nothing: the branch and the base are what
      // make a request this Harness's (#825).
      const app = makeApp();
      await writeSkill("tdd", "edited on disk");
      await promote(app, "tdd");
      answer([request({ reviewers: [{ kind: "user", login: "ada" }] })]);

      const response = await proposalAction(app, "withdraw", {
        name: "tdd",
        number: 45,
      });

      expect(response.status).toBe(200);
      expect(review.closed).toEqual([45]);
    });

    it("refuses every mutation while GitHub cannot be asked", async () => {
      const app = makeApp();
      await writeSkill("tdd", "edited on disk");
      review.answer({ outcome: "unavailable" });

      const created = await proposalAction(app, "create", { name: "tdd" });
      const closed = await proposalAction(app, "withdraw", {
        name: "tdd",
        number: 45,
      });

      expect(await created.json()).toEqual({ error: "review-unavailable" });
      expect(await closed.json()).toEqual({ error: "review-unavailable" });
    });

    it("states GitHub's refusal without a word of its own output", async () => {
      const app = makeApp();
      await writeSkill("tdd", "edited on disk");
      await promote(app, "tdd");
      answer([request({ state: "closed" })]);
      review.answerWrite({ ok: false, error: "failed" });

      const response = await proposalAction(app, "reopen", {
        name: "tdd",
        number: 45,
      });

      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: "action-failed" });
    });

    it("refuses a body that does not carry a request number", async () => {
      const app = makeApp();

      const response = await proposalAction(app, "withdraw", { name: "tdd" });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "invalid-body" });
    });
  });
});
