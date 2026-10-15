import { readFile } from "node:fs/promises";
import { ApmCliDriver, type DeployTarget } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { deployWorld, HOME, lockfilePath } from "../helpers/deploy-world";

// The production composition over an in-memory disk and Harness; only apm and
// the inventory clone's git are faked. What Deploy decides is proven in the
// core lane; this file proves what the route answers.

// The one ref every install names: the Harness root at the resolved release.
const HARNESS_REF = "github.com/fimoklei/agent-harness#v0.5.1";
const REPO = "/work/app";
const repoTarget: DeployTarget = { kind: "repo", repoPath: REPO };
const globalTarget: DeployTarget = { kind: "global" };
const COPY = `${REPO}/.claude/skills/tdd/SKILL.md`;

async function world(options: Parameters<typeof deployWorld>[0] = {}) {
  const w = deployWorld({ released: ["tdd"], ...options });
  await w.register(REPO);
  const deploy = (body: Record<string, unknown>) =>
    w.post("/api/deploy", { type: "skill", name: "tdd", ...body });
  // A first deploy that lands, so a test can then change what it left.
  const deployed = async (target = repoTarget) => {
    const response = await deploy({ target });
    if (response.status !== 200) {
      throw new Error(`the first deploy answered ${response.status}`);
    }
    w.installs.length = 0;
  };
  return { ...w, deploy, deployed };
}

describe("deploy HTTP route", () => {
  it("deploys a skill into a registered repo at the latest tag", async () => {
    const w = await world();

    const res = await w.deploy({ target: repoTarget });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
    });
    expect(w.installs).toEqual([
      { target: repoTarget, ref: HARNESS_REF, skills: ["tdd"] },
    ]);
    expect(w.disk.read(lockfilePath(repoTarget))?.toString()).toContain(
      "v0.5.1",
    );
  });

  it("fetches the Harness right before a deploy, even right after a Harness refresh", async () => {
    const w = await world();
    await w.app.request("/api/harness/refresh", { method: "POST" });
    expect(w.harness.fetches).toBe(1);

    const res = await w.deploy({ target: repoTarget });

    expect(res.status).toBe(200);
    expect(w.harness.fetches).toBe(2);
  });

  it("reports an install that landed nothing as incomplete, never a success", async () => {
    // apm returned success and placed none of the Selection (#951).
    const w = await world();
    w.answers.lands = () => [];

    const res = await w.deploy({ target: repoTarget });

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "deploy-incomplete" });
  });

  it("deploys a skill globally to the detected tools, with no repo registered", async () => {
    // Global crosses no client path, so it needs no registry entry.
    const w = deployWorld({ released: ["tdd"] });

    const res = await w.post("/api/deploy", {
      type: "skill",
      name: "tdd",
      target: globalTarget,
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
    });
    expect(w.installs).toEqual([
      {
        target: globalTarget,
        ref: HARNESS_REF,
        skills: ["tdd"],
        tools: ["claude", "codex"],
      },
    ]);
    expect(w.disk.read(`${HOME}/.claude/skills/tdd/SKILL.md`)).toBeDefined();
  });

  it("refuses a global deploy when no supported tool is detected", async () => {
    const w = await world({ detectedTools: [] });

    const res = await w.deploy({ target: globalTarget });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "no-supported-tool" });
    expect(w.installs).toEqual([]);
  });

  it("refuses to deploy into a repo that is not registered", async () => {
    const w = await world();

    const res = await w.deploy({
      target: { kind: "repo", repoPath: "/work/other" },
    });

    expect(res.status).toBe(403);
    expect(w.installs).toEqual([]);
  });

  it("returns 404 for a skill that is not in the inventory", async () => {
    const w = await world();

    const res = await w.deploy({ name: "nope", target: repoTarget });

    expect(res.status).toBe(404);
  });

  // A refusal is a code and a status; its sentence lives in `packages/web`.
  it("answers a non-skill type with 422, its own code and no sentence", async () => {
    const w = await world();

    const res = await w.deploy({ type: "hook", target: repoTarget });

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "unsupported-primitive-type" });
    expect(w.installs).toEqual([]);
  });

  it("returns 400 for an invalid body", async () => {
    const w = await world();

    expect((await w.post("/api/deploy", { name: "tdd" })).status).toBe(400);
  });

  it("returns 400 for a name that is not a strict slug", async () => {
    const w = await world();

    const res = await w.deploy({ name: "../escape", target: repoTarget });

    expect(res.status).toBe(400);
    expect(w.installs).toEqual([]);
  });

  it("returns 422 when the latest tag does not contain the skill", async () => {
    const w = await world();
    w.answers.skillAtTag = false;

    const res = await w.deploy({ target: repoTarget });

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "no-published-tag" });
    expect(w.installs).toEqual([]);
  });

  it("returns 409 when the local skill diverges from the latest tag", async () => {
    const w = await world();
    w.answers.divergedFromTag = true;

    const res = await w.deploy({ target: repoTarget });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "local-diverged-from-tag" });
    expect(w.installs).toEqual([]);
  });

  it("returns 409 and a receipt when the deployed copy has local edits", async () => {
    // Refuse rather than let a same-ref apm install silently reset a
    // locally-edited deployed subtree (#56).
    const w = await world();
    await w.deployed();
    w.disk.write(COPY, "# tdd, edited\n");

    const res = await w.deploy({ target: repoTarget });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "deployed-diverged-from-lock",
      copyReceipt: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(w.installs).toEqual([]);
  });

  it("deploys past an edited copy on the receipt its refusal minted", async () => {
    const w = await world();
    await w.deployed();
    w.disk.write(COPY, "# tdd, edited\n");
    const refused = await w.deploy({ target: repoTarget });
    const { copyReceipt } = (await refused.json()) as { copyReceipt: string };

    const res = await w.deploy({
      target: repoTarget,
      confirmedCopyReceipt: copyReceipt,
    });

    expect(res.status).toBe(200);
    expect(w.installs).toHaveLength(1);
  });

  it("surfaces a distinct code for a copy with no recorded baseline", async () => {
    // diverged and unverifiable share an action but carry distinct codes (#66).
    const w = await world();
    await w.deployed();
    const recorded = w.disk.read(lockfilePath(repoTarget))?.toString() ?? "";
    w.disk.write(
      lockfilePath(repoTarget),
      recorded.replace(/ {2}deployed_file_hashes:\n( {4}.*\n)+/, ""),
    );

    const res = await w.deploy({ target: repoTarget });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "deployed-unverifiable",
      copyReceipt: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("returns 409 with no receipt when the deployed copy cannot be read", async () => {
    const w = await world();
    await w.deployed();
    w.disk.setUnreadable(`${REPO}/.claude/skills/tdd`);

    const res = await w.deploy({ target: repoTarget });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "deployed-unreadable" });
    expect(w.installs).toEqual([]);
  });

  it("returns 409 when the target lockfile cannot be parsed", async () => {
    const w = await world();
    await w.deployed();
    w.disk.write(lockfilePath(repoTarget), "dependencies: not-a-list\n");

    const res = await w.deploy({ target: repoTarget });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "lockfile-malformed" });
    expect(w.installs).toEqual([]);
  });

  it("returns 409 for a concurrent deploy to the same repo", async () => {
    const w = await world();
    let release: () => void = () => undefined;
    w.answers.installHold = new Promise<void>((resolve) => {
      release = resolve;
    });

    const first = w.deploy({ target: repoTarget });
    // Give the first request time to pass the lock before the second lands.
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = await w.deploy({ target: repoTarget });

    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: "deploy-in-progress" });
    release();
    expect((await first).status).toBe(200);
    expect(w.installs).toHaveLength(1);
  });

  it("returns a sanitized 502 when apm fails, never leaking its output", async () => {
    const w = await world();
    w.answers.installRefusal = "throw";

    const res = await w.deploy({ target: repoTarget });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toEqual({ error: "deploy-failed" });
    expect(JSON.stringify(body)).not.toContain("token in stderr");
  });

  it("answers a deploy that did not start with the same 502 as one that did not finish", async () => {
    const w = await world();
    w.answers.latestTag = { ok: false, reason: "failed" };

    const res = await w.deploy({ target: repoTarget });

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "deploy-not-started" });
  });

  it("surfaces a timed-out install as a 504 of its own", async () => {
    const w = await world();
    w.answers.installRefusal = { ok: false, reason: "timed-out" };

    const res = await w.deploy({ target: repoTarget });

    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({ error: "deploy-timed-out" });
  });

  it("surfaces a timed-out release lookup as a 504 of its own", async () => {
    const w = await world();
    w.answers.latestTag = { ok: false, reason: "timed-out" };

    const res = await w.deploy({ target: repoTarget });

    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({ error: "tag-check-timed-out" });
  });

  it("surfaces missing GitHub auth as a distinct 502", async () => {
    const w = await world();
    w.answers.latestTag = { ok: false, reason: "auth-required" };

    const res = await w.deploy({ target: repoTarget });

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "auth-required" });
  });

  it("surfaces a symlinked destination as its own status", async () => {
    const w = await world();
    w.disk.makeDir("/harness/.apm/skills/tdd");
    w.disk.symlink(`${REPO}/.claude/skills/tdd`, "/harness/.apm/skills/tdd");
    const refusal = await readFile(
      "tests/fixtures/apm-install-symlink-refused.txt",
      "utf8",
    );
    // The real driver, fed apm's captured refusal with a token-bearing URL,
    // so classification and the no-leak guarantee run end to end.
    w.answers.deploySkill = (input) =>
      new ApmCliDriver({
        run: async () => {
          throw Object.assign(new Error("Command failed: apm install"), {
            code: 1,
            stdout: `${refusal}\nhttps://x-access-token:ghp_secret@github.com`,
            stderr: "",
          });
        },
      }).deploySkill(input);

    const res = await w.deploy({ target: repoTarget });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; linkedPath?: string };
    expect(body.error).toBe("destination-symlinked");
    // The path is recomputed by Maestro, so the notice never forwards apm's prose (#748).
    expect(body.linkedPath).toBe(`${REPO}/.claude/skills/tdd`);
    expect(JSON.stringify(body)).not.toContain("ghp_secret");
    expect(JSON.stringify(body)).not.toContain("refusing to deploy");
  });
});
