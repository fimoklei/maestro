import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  DeployedCleanupAdapter,
  DeployedContentAdapter,
  type DeployedContentState,
  DeployedLocation,
  DeployedRefAdapter,
  type DeployTarget,
  InFlightLocks,
  InventoryReader,
  NodeFileSystem,
  RemoveDeployedSkill,
  type SupportedTool,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { realRegistry } from "../helpers/real-registry";
import { stubBrowse } from "../helpers/stub-browse";
import { stubConnect } from "../helpers/stub-connect";
import { stubDeploy } from "../helpers/stub-deploy";
import { stubDeployState } from "../helpers/stub-deploy-state";
import { stubDrift } from "../helpers/stub-drift";

// Integration lane: the remove route over the real Hono app, a real registry and
// a real lockfile on disk. Only the apm driver is faked — what it is handed is
// the assertion, since the ref is what decides whether apm removes the right
// package or silently nothing. Origin/Host guard enforcement lives in
// server-security.test.ts.
// A deployed file and the sha256 apm would have recorded for it, so a lockfile
// fixture can claim a clean copy without the test recomputing the hash the way
// the guard does.
const SKILL_FILE_CONTENT = "# tdd\n";
const TDD_SKILL_SHA256 =
  "5c35b2b6a904c72893741b59eaf0a591f5b13810d0286949128c2e1888acfba2";

describe("remove HTTP route", () => {
  let home: string;
  let repo: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "maestro-remove-home-"));
    repo = await mkdtemp(join(tmpdir(), "maestro-remove-repo-"));
  });

  afterEach(async () => {
    for (const dir of [home, repo]) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  const lockfileWith = (entries: string[]) =>
    ["lockfile_version: '1'", "dependencies:", ...entries, ""].join("\n");

  const skillEntry = (name: string, tag = "v0.5.1") =>
    [
      "- repo_url: fimoklei/agent-harness",
      "  host: github.com",
      `  resolved_ref: ${tag}`,
      `  virtual_path: skills/${name}`,
      "  package_type: claude_skill",
    ].join("\n");

  function makeApp(options?: {
    removed?: boolean;
    // What the destination guard finds on disk. "clean" by default — the guard
    // itself is covered in the core lane; here it only has to reach the wire.
    deployedState?: DeployedContentState;
    // The tools the machine is pretending to have. Only the global route reads
    // it; an empty list is the no-supported-tool refusal.
    detectedTools?: SupportedTool[];
    // Swap the stubbed guard for the real one, so a test can prove what an
    // actual tree on disk classifies as. Off by default: most tests here are
    // about the route, not the walk.
    realDeployedContent?: boolean;
  }) {
    const fs = new NodeFileSystem();
    const registry = realRegistry(fs, join(home, "config.json"));
    const inventory = new InventoryReader({ fs, resolvePath: () => undefined });
    const removeCalls: Array<{ target: DeployTarget; ref: string }> = [];
    const classifyCalls: Array<{ tools?: readonly SupportedTool[] }> = [];
    const locks = new InFlightLocks();
    const remove = new RemoveDeployedSkill({
      registry,
      locks,
      deployedRef: new DeployedRefAdapter({
        fs,
        // HOME redirected at the sandbox, so the global lockfile this resolves
        // is the test's own — never the real ~/.apm (apm-driver.md § Danger).
        location: new DeployedLocation({ HOME: home }),
      }),
      deployedContent: options?.realDeployedContent
        ? new DeployedContentAdapter({
            location: new DeployedLocation({ HOME: home }),
          })
        : {
            classify: async ({ tools }) => {
              classifyCalls.push({ tools });
              return options?.deployedState ?? "clean";
            },
          },
      apm: {
        removeSkill: async (input) => {
          removeCalls.push(input);
          return (options?.removed ?? true) ? { ok: true } : { ok: false };
        },
      },
      // The real reclaim on the real tree, pointed at the sandbox home: what a
      // global removal leaves behind is a fact about directories, so faking it
      // would prove nothing (#339).
      deployedCleanup: new DeployedCleanupAdapter({
        location: new DeployedLocation({ HOME: home }),
      }),
      toolPresence: {
        detectGlobalTools: async () => options?.detectedTools ?? ["claude"],
      },
      canonicalPath: (path) => fs.realpath(path),
      // The same sandbox HOME the cleanup and the real guard resolve against,
      // so a reclaim preview names exactly the path the cleanup would delete.
      location: new DeployedLocation({ HOME: home }),
    });
    const app = createApp({
      registry,
      inventory,
      deployState: stubDeployState({ fs }),
      deploy: stubDeploy({ inventory, registry, locks }),
      remove,
      drift: stubDrift({ registry }),
      resolveGlobalRoot: () => join(home, "apm"),
      connect: stubConnect(),
      browse: stubBrowse(),
      enforceOriginHost: false,
    });
    return { app, registry, removeCalls, classifyCalls };
  }

  const removeRequest = (
    app: ReturnType<typeof makeApp>["app"],
    body: unknown,
  ) =>
    app.request("/api/deploy/remove", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  const removeTdd = (
    app: ReturnType<typeof makeApp>["app"],
    repoPath: string,
  ) =>
    removeRequest(app, {
      type: "skill",
      name: "tdd",
      target: { kind: "repo", repoPath },
    });

  it("removes a deployed skill with the ref its lockfile records", async () => {
    const { app, registry, removeCalls } = makeApp();
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([skillEntry("tdd")]),
      "utf8",
    );
    await registry.register(repo);

    const response = await removeTdd(app, repo);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      removed: {
        type: "skill",
        name: "tdd",
        version: "v0.5.1",
        scope: { kind: "repo" },
      },
    });
    expect(removeCalls).toEqual([
      {
        target: { kind: "repo", repoPath: repo },
        ref: "github.com/fimoklei/agent-harness/skills/tdd#v0.5.1",
      },
    ]);
  });

  it("refuses a repo outside the registry before apm or the lockfile is touched", async () => {
    const { app, removeCalls } = makeApp();
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([skillEntry("tdd")]),
      "utf8",
    );

    const response = await removeTdd(app, repo);

    expect(response.status).toBe(403);
    expect(removeCalls).toEqual([]);
    // Nothing about the unregistered repo's lockfile leaks back.
    expect(JSON.stringify(await response.json())).not.toContain("v0.5.1");
  });

  it("refuses a symlinked spelling of an unregistered repo just the same", async () => {
    // The gate canonicalizes with realpath before comparing, so a path that
    // resolves outside the registry cannot slip past by spelling.
    const { app, removeCalls } = makeApp();
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([skillEntry("tdd")]),
      "utf8",
    );

    const response = await removeTdd(app, join(repo, "..", "..", "etc"));

    expect(response.status).toBe(403);
    expect(removeCalls).toEqual([]);
  });

  it("reports a skill the repo does not carry as not found", async () => {
    const { app, registry, removeCalls } = makeApp();
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([skillEntry("jobs")]),
      "utf8",
    );
    await registry.register(repo);

    const response = await removeTdd(app, repo);

    expect(response.status).toBe(404);
    expect(removeCalls).toEqual([]);
  });

  it("reports a repo with no lockfile at all as nothing deployed", async () => {
    const { app, registry } = makeApp();
    await registry.register(repo);

    expect((await removeTdd(app, repo)).status).toBe(404);
  });

  it("surfaces a malformed lockfile as a conflict, never a removal", async () => {
    const { app, registry, removeCalls } = makeApp();
    await writeFile(
      join(repo, "apm.lock.yaml"),
      "dependencies: not-a-list\n",
      "utf8",
    );
    await registry.register(repo);

    const response = await removeTdd(app, repo);

    expect(response.status).toBe(409);
    expect(removeCalls).toEqual([]);
  });

  it("refuses when the lockfile entry names no origin to build a ref from", async () => {
    const { app, registry, removeCalls } = makeApp();
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([
        [
          "- resolved_ref: v0.5.1",
          "  virtual_path: skills/tdd",
          "  package_type: claude_skill",
        ].join("\n"),
      ]),
      "utf8",
    );
    await registry.register(repo);

    expect((await removeTdd(app, repo)).status).toBe(409);
    expect(removeCalls).toEqual([]);
  });

  it("removes a copy with local edits the user already confirmed", async () => {
    // The confirmation stated the consequence through the preflight route
    // below, so this request is the user's informed word — it is carried out
    // rather than refused a second time (#337).
    const { app, registry, removeCalls } = makeApp({
      deployedState: "diverged",
    });
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([skillEntry("tdd")]),
      "utf8",
    );
    await registry.register(repo);

    const response = await removeTdd(app, repo);

    expect(response.status).toBe(200);
    expect(removeCalls).toHaveLength(1);
  });

  it("still refuses a copy it cannot read, confirmed or not", async () => {
    // Not a divergence the user can consent to: we cannot tell what is there,
    // and apm would delete it anyway.
    const { app, registry, removeCalls } = makeApp({
      deployedState: "unreadable",
    });
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([skillEntry("tdd")]),
      "utf8",
    );
    await registry.register(repo);

    expect((await removeTdd(app, repo)).status).toBe(409);
    expect(removeCalls).toEqual([]);
  });

  it("reports an unproven removal as a failure the user can read", async () => {
    const { app, registry } = makeApp({ removed: false });
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([skillEntry("tdd")]),
      "utf8",
    );
    await registry.register(repo);

    const response = await removeTdd(app, repo);

    expect(response.status).toBe(502);
    const body = (await response.json()) as { message: string };
    expect(body.message).toMatch(/\S/);
  });

  // apm reports one outcome for every tool at once, so a failed removal's
  // per-target answer is read off the disk (ADR-0013, #416).
  it("reports the repo's copy as still there when a failed removal left it", async () => {
    const { app, registry } = makeApp({
      removed: false,
      realDeployedContent: true,
    });
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([skillEntry("tdd")]),
      "utf8",
    );
    await mkdir(join(repo, ".claude", "skills", "tdd"), { recursive: true });
    await writeFile(
      join(repo, ".claude", "skills", "tdd", "SKILL.md"),
      SKILL_FILE_CONTENT,
      "utf8",
    );
    await registry.register(repo);

    const response = await removeTdd(app, repo);

    expect(response.status).toBe(502);
    expect((await response.json()) as unknown).toMatchObject({
      error: "remove-failed",
      outcome: { scope: "repo", state: "not-removed" },
    });
  });

  it("sends no outcome for a failure that never reached apm", async () => {
    const { app, registry, removeCalls } = makeApp();
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([skillEntry("jobs")]),
      "utf8",
    );
    await registry.register(repo);

    const response = await removeTdd(app, repo);

    expect(response.status).toBe(404);
    expect(await response.json()).not.toHaveProperty("outcome");
    expect(removeCalls).toEqual([]);
  });

  it("refuses a primitive type other than a skill", async () => {
    const { app, registry } = makeApp();
    await registry.register(repo);

    const response = await removeRequest(app, {
      type: "hook",
      name: "tdd",
      target: { kind: "repo", repoPath: repo },
    });

    expect(response.status).toBe(422);
  });

  it("refuses a name that is not a lowercase slug", async () => {
    const { app, registry } = makeApp();
    await registry.register(repo);

    const response = await removeRequest(app, {
      type: "skill",
      name: "../etc/passwd",
      target: { kind: "repo", repoPath: repo },
    });

    expect(response.status).toBe(400);
  });

  it("rejects a body that is not the expected shape", async () => {
    const { app } = makeApp();

    expect((await removeRequest(app, { name: "tdd" })).status).toBe(400);
  });

  // The user scope. Its lockfile location is apm's own, resolved server-side, so
  // the request carries no path at all (J07, #338).
  describe("the global target", () => {
    // Resolved per call, not at collection time: `home` is a fresh sandbox per
    // test.
    async function writeGlobalLockfile(entries: string[]) {
      const apmRoot = join(home, ".apm");
      await mkdir(apmRoot, { recursive: true });
      await writeFile(
        join(apmRoot, "apm.lock.yaml"),
        lockfileWith(entries),
        "utf8",
      );
    }

    // One deployed file, written wherever a test needs a copy to exist. Its
    // content is fixed so the recorded hash can be a literal.
    async function writeSkillFile(relativePath: string) {
      const absolute = join(home, relativePath);
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, SKILL_FILE_CONTENT, "utf8");
    }

    const preflightGlobally = (app: ReturnType<typeof makeApp>["app"]) =>
      app.request("/api/deploy/remove/preflight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "skill",
          name: "tdd",
          target: { kind: "global" },
        }),
      });

    const removeGlobally = (
      app: ReturnType<typeof makeApp>["app"],
      confirmedReclaimToken?: string,
    ) =>
      removeRequest(app, {
        type: "skill",
        name: "tdd",
        target: { kind: "global" },
        ...(confirmedReclaimToken ? { confirmedReclaimToken } : {}),
      });

    // The token a real preflight against this app would return — never
    // hand-built, so a test proves the actual execute→preflight contract
    // rather than a path the implementation would never issue.
    async function reclaimTokenFromPreflight(
      app: ReturnType<typeof makeApp>["app"],
    ): Promise<string | undefined> {
      const response = await preflightGlobally(app);
      const { reclaim } = (await response.json()) as {
        reclaim: { token: string } | null;
      };
      return reclaim?.token;
    }

    it("removes the skill with the ref the global lockfile records", async () => {
      const { app, removeCalls } = makeApp();
      await writeGlobalLockfile([skillEntry("tdd")]);

      const response = await removeGlobally(app);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        removed: {
          type: "skill",
          name: "tdd",
          version: "v0.5.1",
          scope: { kind: "global", tools: ["claude"] },
        },
      });
      expect(removeCalls).toEqual([
        {
          target: { kind: "global" },
          ref: "github.com/fimoklei/agent-harness/skills/tdd#v0.5.1",
        },
      ]);
    });

    it("takes no path from the client, even one that is offered", async () => {
      // A repoPath alongside a global kind must not widen what the route reads:
      // the discriminated union drops it, and the location stays apm's own.
      const { app, removeCalls } = makeApp();
      await writeGlobalLockfile([skillEntry("tdd")]);

      const response = await removeRequest(app, {
        type: "skill",
        name: "tdd",
        target: { kind: "global", repoPath: "/etc" },
      });

      expect(response.status).toBe(200);
      expect(removeCalls).toEqual([
        {
          target: { kind: "global" },
          ref: "github.com/fimoklei/agent-harness/skills/tdd#v0.5.1",
        },
      ]);
    });

    it("checks every supported tool's copy, not only the detected ones", async () => {
      const { app, classifyCalls } = makeApp({ detectedTools: ["codex"] });
      await writeGlobalLockfile([skillEntry("tdd")]);

      await removeGlobally(app);

      expect(classifyCalls).toEqual([{ tools: undefined }]);
    });

    it("answers per detected tool against a real tree", async () => {
      // The real guard, on a tree where the two tools disagree: Claude's copy
      // matches the lockfile exactly, and the Codex copy beside it was never
      // recorded there at all. One aggregate answer would have to pick one of
      // those and state it about both rows (#414).
      const { app } = makeApp({
        realDeployedContent: true,
        detectedTools: ["claude", "codex"],
      });
      await writeGlobalLockfile([
        [
          skillEntry("tdd"),
          "  deployed_file_hashes:",
          `    .claude/skills/tdd/SKILL.md: sha256:${TDD_SKILL_SHA256}`,
        ].join("\n"),
      ]);
      await writeSkillFile(".claude/skills/tdd/SKILL.md");
      await writeSkillFile(".agents/skills/tdd/SKILL.md");

      const response = await preflightGlobally(app);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        check: {
          scope: "global",
          tools: [
            { tool: "claude", warning: null },
            { tool: "codex", warning: "cannot-verify-local-edits" },
          ],
        },
        // Codex is not exclusive to its skills dir (ten apm targets share
        // .agents), so a detected Codex is never a nameable reclaim either.
        reclaim: null,
      });
    });

    it("names the leftover Claude Code copy and issues a token for it", async () => {
      // A machine where Claude Code has dropped off still carries a global
      // deploy's .claude copy. Naming it here is what lets the dialog state
      // it before the user confirms, rather than deleting a larger set than
      // the dialog ever promised. The token is what the execute route
      // requires back before it will actually reclaim that path.
      const { app } = makeApp({ detectedTools: ["codex"] });
      await writeGlobalLockfile([skillEntry("tdd")]);

      const response = await preflightGlobally(app);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        check: {
          scope: "global",
          tools: [
            { tool: "codex", warning: null },
            { tool: "claude", warning: null },
          ],
        },
        reclaim: {
          previews: [
            { tool: "claude", path: join(home, ".claude/skills/tdd") },
          ],
          token: expect.stringMatching(/^[0-9a-f]{64}$/),
        },
      });
    });

    it("names the edits inside the leftover copy it is about to reclaim", async () => {
      // Claude Code has dropped off this machine, so its .claude tree is the
      // reclaim — and it carries edits the lockfile never recorded. Naming the
      // path while calling that copy an ordinary one would be consent for a
      // deletion whose real cost was never stated (#390, #414).
      const { app } = makeApp({
        realDeployedContent: true,
        detectedTools: ["codex"],
      });
      await writeGlobalLockfile([
        [
          skillEntry("tdd"),
          "  deployed_file_hashes:",
          `    .claude/skills/tdd/SKILL.md: sha256:${"0".repeat(64)}`,
        ].join("\n"),
      ]);
      await writeSkillFile(".claude/skills/tdd/SKILL.md");

      const response = await preflightGlobally(app);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        check: {
          scope: "global",
          tools: [
            { tool: "codex", warning: null },
            { tool: "claude", warning: "local-edits-will-be-lost" },
          ],
        },
        reclaim: {
          previews: [
            { tool: "claude", path: join(home, ".claude/skills/tdd") },
          ],
          token: expect.stringMatching(/^[0-9a-f]{64}$/),
        },
      });
    });

    it("leaves an unrelated skill's copy out of the answer", async () => {
      // The scan widened to every tool, never to every skill: another skill's
      // tree under the same directories says nothing about this removal.
      const { app } = makeApp({
        realDeployedContent: true,
        detectedTools: ["claude"],
      });
      await writeGlobalLockfile([
        [
          skillEntry("tdd"),
          "  deployed_file_hashes:",
          `    .claude/skills/tdd/SKILL.md: sha256:${TDD_SKILL_SHA256}`,
        ].join("\n"),
      ]);
      await writeSkillFile(".claude/skills/tdd/SKILL.md");
      await writeSkillFile(".agents/skills/jobs/SKILL.md");

      const response = await preflightGlobally(app);

      expect(await response.json()).toEqual({
        check: { scope: "global", tools: [{ tool: "claude", warning: null }] },
        reclaim: null,
      });
    });

    // Whether a path still exists under the sandbox home, so a test can state
    // what the removal reclaimed and what it left alone.
    const existsUnderHome = async (relativePath: string) => {
      try {
        await access(join(home, relativePath));
        return true;
      } catch {
        return false;
      }
    };

    it("reclaims the copy left for a tool this machine no longer detects, once confirmed", async () => {
      // apm's uninstall deletes by the targets its own apm.yml lists, so the
      // copy for a tool that has since dropped off survives it. Removing that
      // tree is what makes the removal complete (#339) — but only once the
      // request echoes back the token this same scope's preflight issued,
      // never a client-guessed path (#390).
      const { app } = makeApp({ detectedTools: ["codex"] });
      await writeGlobalLockfile([skillEntry("tdd")]);
      await writeSkillFile(".claude/skills/tdd/SKILL.md");
      await writeSkillFile(".claude/skills/jobs/SKILL.md");
      const confirmedReclaimToken = await reclaimTokenFromPreflight(app);

      expect((await removeGlobally(app, confirmedReclaimToken)).status).toBe(
        200,
      );

      expect(await existsUnderHome(".claude/skills/tdd")).toBe(false);
      // Another skill under the same directory is nobody's leftover.
      expect(await existsUnderHome(".claude/skills/jobs/SKILL.md")).toBe(true);
    });

    it("leaves the leftover copy alone when nothing confirmed it", async () => {
      // Without a confirmed token, a global removal must not
      // delete more than the dialog named.
      const { app } = makeApp({ detectedTools: ["codex"] });
      await writeGlobalLockfile([skillEntry("tdd")]);
      await writeSkillFile(".claude/skills/tdd/SKILL.md");

      expect((await removeGlobally(app)).status).toBe(200);

      expect(await existsUnderHome(".claude/skills/tdd/SKILL.md")).toBe(true);
    });

    it("leaves the leftover copy alone for a token the caller merely guessed", async () => {
      // The bypass the review flagged: a direct request that never called
      // preflight but echoes back a plausible-looking token.
      const { app } = makeApp({ detectedTools: ["codex"] });
      await writeGlobalLockfile([skillEntry("tdd")]);
      await writeSkillFile(".claude/skills/tdd/SKILL.md");

      expect((await removeGlobally(app, "a".repeat(64))).status).toBe(200);

      expect(await existsUnderHome(".claude/skills/tdd/SKILL.md")).toBe(true);
    });

    it("keeps a skills directory several tools read", async () => {
      // Codex is undetected, but nine other apm targets deploy under .agents.
      // An absent Codex proves nothing about them, so its copy stays (#202).
      const { app } = makeApp({ detectedTools: ["claude"] });
      await writeGlobalLockfile([skillEntry("tdd")]);
      await writeSkillFile(".agents/skills/tdd/SKILL.md");

      expect((await removeGlobally(app)).status).toBe(200);

      expect(await existsUnderHome(".agents/skills/tdd/SKILL.md")).toBe(true);
    });

    it("reclaims nothing when apm never confirmed the removal", async () => {
      const { app } = makeApp({ detectedTools: ["codex"], removed: false });
      await writeGlobalLockfile([skillEntry("tdd")]);
      await writeSkillFile(".claude/skills/tdd/SKILL.md");

      expect((await removeGlobally(app)).status).toBe(502);

      expect(await existsUnderHome(".claude/skills/tdd/SKILL.md")).toBe(true);
    });

    it("answers per detected tool after a failed global removal", async () => {
      const { app } = makeApp({
        detectedTools: ["claude", "codex"],
        removed: false,
        realDeployedContent: true,
      });
      await writeGlobalLockfile([skillEntry("tdd")]);
      // Only Codex still has a copy: apm came off Claude Code and could not say so.
      await writeSkillFile(".agents/skills/tdd/SKILL.md");

      const response = await removeGlobally(app);

      expect(response.status).toBe(502);
      expect((await response.json()) as unknown).toMatchObject({
        outcome: {
          scope: "global",
          tools: [
            { tool: "claude", state: "removed" },
            { tool: "codex", state: "not-removed" },
          ],
        },
      });
    });

    it("refuses when the machine has no supported tool", async () => {
      const { app, removeCalls } = makeApp({ detectedTools: [] });
      await writeGlobalLockfile([skillEntry("tdd")]);

      const response = await removeGlobally(app);

      expect(response.status).toBe(409);
      expect(removeCalls).toEqual([]);
      const body = (await response.json()) as { message: string };
      expect(body.message).toMatch(/\S/);
    });

    it("reports a skill the global scope does not carry as not found", async () => {
      const { app, removeCalls } = makeApp();
      await writeGlobalLockfile([skillEntry("jobs")]);

      expect((await removeGlobally(app)).status).toBe(404);
      expect(removeCalls).toEqual([]);
    });

    it("names what the removal would destroy before it runs", async () => {
      const { app, removeCalls } = makeApp({ deployedState: "diverged" });

      const response = await app.request("/api/deploy/remove/preflight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "skill",
          name: "tdd",
          target: { kind: "global" },
        }),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        check: {
          scope: "global",
          tools: [{ tool: "claude", warning: "local-edits-will-be-lost" }],
        },
        reclaim: null,
      });
      expect(removeCalls).toEqual([]);
    });
  });

  // The check the confirmation runs before the user commits. It answers what
  // the removal would destroy; it never removes anything itself.
  describe("preflight", () => {
    const preflightTdd = (
      app: ReturnType<typeof makeApp>["app"],
      repoPath: string,
    ) =>
      app.request("/api/deploy/remove/preflight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "skill",
          name: "tdd",
          target: { kind: "repo", repoPath },
        }),
      });

    it("names local edits as the thing a removal would destroy", async () => {
      const { app, registry, removeCalls } = makeApp({
        deployedState: "diverged",
      });
      await registry.register(repo);

      const response = await preflightTdd(app, repo);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        // A repo has one row, and its deployed copy spans several tool
        // subtrees, so one aggregate answer is the honest thing to state.
        check: { scope: "repo", warning: "local-edits-will-be-lost" },
        reclaim: null,
      });
      expect(removeCalls).toEqual([]);
    });

    it("keeps an unverifiable copy apart from a diverged one", async () => {
      const { app, registry } = makeApp({ deployedState: "unverifiable" });
      await registry.register(repo);

      expect(await (await preflightTdd(app, repo)).json()).toEqual({
        check: { scope: "repo", warning: "cannot-verify-local-edits" },
        reclaim: null,
      });
    });

    it("warns about nothing when the copy still matches its lockfile", async () => {
      const { app, registry } = makeApp({ deployedState: "clean" });
      await registry.register(repo);

      expect(await (await preflightTdd(app, repo)).json()).toEqual({
        check: { scope: "repo", warning: null },
        reclaim: null,
      });
    });

    it("refuses an unregistered repo, so it cannot probe a lockfile", async () => {
      const { app } = makeApp({ deployedState: "diverged" });

      expect((await preflightTdd(app, repo)).status).toBe(403);
    });

    it("rejects a body that is not the expected shape", async () => {
      const { app } = makeApp();

      const response = await app.request("/api/deploy/remove/preflight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "tdd" }),
      });

      expect(response.status).toBe(400);
    });
  });
});
