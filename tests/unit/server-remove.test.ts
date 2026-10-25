import { createHash } from "node:crypto";
import type { DeployTarget } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { deployWorld, HOME, lockfilePath } from "../helpers/deploy-world";

// The production composition over an in-memory disk: only apm is faked, so
// every verdict below is read off the copy's own bytes. What Remove decides
// is proven in the core lane; this file proves what the route answers.
const REPO = "/work/app";
const REF = "github.com/fimoklei/agent-harness/.apm/skills/tdd#v0.5.1";
const COPY = "# tdd\n";
const COPY_SHA256 = createHash("sha256").update(COPY).digest("hex");

const repoTarget = { kind: "repo", repoPath: REPO } as const;
const globalTarget = { kind: "global" } as const;
type Target = DeployTarget;

const lockfileWith = (entries: string[]) =>
  ["lockfile_version: '1'", "dependencies:", ...entries, ""].join("\n");

// A per-skill entry; `hashed` records the copy's baseline, so it can read clean.
const skillEntry = (name: string, hashed: string[] = []) =>
  [
    "- repo_url: fimoklei/agent-harness",
    "  host: github.com",
    "  resolved_ref: v0.5.1",
    `  virtual_path: .apm/skills/${name}`,
    "  package_type: claude_skill",
    ...(hashed.length === 0
      ? []
      : [
          "  deployed_file_hashes:",
          ...hashed.map((path) => `    ${path}: sha256:${COPY_SHA256}`),
        ]),
  ].join("\n");

const root = (target: Target) => (target.kind === "repo" ? REPO : HOME);

async function world(options: Parameters<typeof deployWorld>[0] = {}) {
  const built = deployWorld({ detectedTools: ["claude"], ...options });
  await built.register(REPO);
  const seed = (target: Target, entries: string[]) =>
    built.disk.write(lockfilePath(target), lockfileWith(entries));
  const copy = (target: Target, path: string, contents = COPY) =>
    built.disk.write(`${root(target)}/${path}`, contents);
  const preflight = async (target: Target, name = "tdd") =>
    built.post("/api/deploy/remove/preflight", {
      type: "skill",
      name,
      target,
    });
  const receipt = async (target: Target) =>
    ((await (await preflight(target)).json()) as { receipt?: string }).receipt;
  const remove = (body: Record<string, unknown>) =>
    built.post("/api/deploy/remove", { type: "skill", name: "tdd", ...body });
  // Every removal needs its own preflight's receipt (#364).
  const removeConfirmed = async (target: Target, extra = {}) =>
    remove({
      target,
      confirmedRemovalReceipt: await receipt(target),
      ...extra,
    });
  return { ...built, seed, copy, preflight, receipt, remove, removeConfirmed };
}

describe("remove HTTP route", () => {
  it("removes a deployed skill with the ref its lockfile records", async () => {
    const w = await world();
    w.seed(repoTarget, [skillEntry("tdd", [".claude/skills/tdd/SKILL.md"])]);
    w.copy(repoTarget, ".claude/skills/tdd/SKILL.md");

    const response = await w.removeConfirmed(repoTarget);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      removed: {
        type: "skill",
        name: "tdd",
        version: "v0.5.1",
        scope: { kind: "repo" },
      },
    });
    expect(w.uninstalls).toEqual([{ target: repoTarget, ref: REF }]);
  });

  it("refuses a repo outside the registry before apm or the lockfile is touched", async () => {
    const w = await world();
    const other = { kind: "repo", repoPath: "/work/other" } as const;
    w.disk.write(`/work/other/.git`, "gitdir: elsewhere");
    w.disk.write(lockfilePath(other), lockfileWith([skillEntry("tdd")]));

    const response = await w.remove({ target: other });

    expect(response.status).toBe(403);
    expect(w.uninstalls).toEqual([]);
    expect(JSON.stringify(await response.json())).not.toContain("v0.5.1");
  });

  it("refuses a dotted spelling that leaves the registered repo just the same", async () => {
    const w = await world();
    w.seed(repoTarget, [skillEntry("tdd")]);

    const response = await w.remove({
      target: { kind: "repo", repoPath: `${REPO}/../../etc` },
    });

    expect(response.status).toBe(403);
    expect(w.uninstalls).toEqual([]);
  });

  it("answers a skill the repo does not carry with 404 and no outcome", async () => {
    const w = await world();
    w.seed(repoTarget, [skillEntry("jobs")]);

    const response = await w.removeConfirmed(repoTarget);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not-deployed" });
    expect(w.uninstalls).toEqual([]);
  });

  it("surfaces a malformed lockfile as a conflict, never a removal", async () => {
    const w = await world();
    w.disk.write(lockfilePath(repoTarget), "dependencies: not-a-list\n");

    const response = await w.removeConfirmed(repoTarget);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "lockfile-malformed" });
    expect(w.uninstalls).toEqual([]);
  });

  it("refuses when the lockfile entry names no origin to build a ref from", async () => {
    const w = await world();
    w.seed(repoTarget, [
      [
        "- resolved_ref: v0.5.1",
        "  virtual_path: .apm/skills/tdd",
        "  package_type: claude_skill",
      ].join("\n"),
    ]);

    const response = await w.removeConfirmed(repoTarget);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "ref-unresolvable" });
    expect(w.uninstalls).toEqual([]);
  });

  it("restates the cost, its receipt and the reclaim when nothing confirmed it", async () => {
    // No recorded baseline: the copy's edits cannot be ruled out.
    const w = await world();
    w.seed(repoTarget, [skillEntry("tdd")]);
    w.copy(repoTarget, ".claude/skills/tdd/SKILL.md");

    const response = await w.remove({ target: repoTarget });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "cost-not-acknowledged",
      check: { scope: "repo", warning: "cannot-verify-local-edits" },
      receipt: expect.stringMatching(/^[0-9a-f]{64}$/),
      reclaim: null,
    });
    expect(w.uninstalls).toEqual([]);
  });

  it("removes that copy once its own preflight receipt rides along", async () => {
    const w = await world();
    w.seed(repoTarget, [skillEntry("tdd")]);
    w.copy(repoTarget, ".claude/skills/tdd/SKILL.md");

    const response = await w.removeConfirmed(repoTarget);

    expect(response.status).toBe(200);
    expect(w.uninstalls).toHaveLength(1);
  });

  it("rejects a receipt that is not even token-shaped, at the edge", async () => {
    const w = await world();
    w.seed(repoTarget, [skillEntry("tdd")]);

    const response = await w.remove({
      target: repoTarget,
      confirmedRemovalReceipt: "not-a-receipt",
    });

    expect(response.status).toBe(400);
    expect(w.uninstalls).toEqual([]);
  });

  it("refuses a copy with local edits with its code alone, receipt or not", async () => {
    const w = await world();
    w.seed(repoTarget, [skillEntry("tdd", [".claude/skills/tdd/SKILL.md"])]);
    w.copy(repoTarget, ".claude/skills/tdd/SKILL.md", "# tdd, edited\n");

    const response = await w.remove({
      target: repoTarget,
      confirmedRemovalReceipt: "a".repeat(64),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "deployed-diverged-from-lock",
    });
    expect(w.uninstalls).toEqual([]);
  });

  it("still refuses a copy it cannot read, confirmed or not", async () => {
    const w = await world();
    w.seed(repoTarget, [skillEntry("tdd", [".claude/skills/tdd/SKILL.md"])]);
    w.copy(repoTarget, ".claude/skills/tdd/SKILL.md");
    w.disk.setUnreadable(`${REPO}/.claude/skills/tdd`);

    const response = await w.removeConfirmed(repoTarget);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "deployed-unreadable" });
    expect(w.uninstalls).toEqual([]);
  });

  // apm reports one outcome for every tool, so a failed removal's
  // per-target answer is read off the disk (#416).
  it("answers an unproven removal with 502 and the copy it left behind", async () => {
    const w = await world();
    w.seed(repoTarget, [skillEntry("tdd", [".claude/skills/tdd/SKILL.md"])]);
    w.copy(repoTarget, ".claude/skills/tdd/SKILL.md");
    w.answers.uninstallAnswer = () => "unproven";

    const response = await w.removeConfirmed(repoTarget);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "remove-failed",
      outcome: { scope: "repo", state: "not-removed" },
    });
  });

  it("refuses a primitive type other than a skill", async () => {
    const w = await world();

    const response = await w.remove({ type: "hook", target: repoTarget });

    expect(response.status).toBe(422);
  });

  it("refuses a name that is not a lowercase slug", async () => {
    const w = await world();

    const response = await w.remove({
      name: "../etc/passwd",
      target: repoTarget,
    });

    expect(response.status).toBe(400);
  });

  it("rejects a body that is not the expected shape", async () => {
    const w = await world();

    expect((await w.post("/api/deploy/remove", { name: "tdd" })).status).toBe(
      400,
    );
  });

  // The user scope: apm resolves its lockfile, so the request carries no path (#338).
  describe("the global target", () => {
    it("removes the skill with the ref the global lockfile records", async () => {
      const w = await world();
      w.seed(globalTarget, [skillEntry("tdd")]);

      const response = await w.removeConfirmed(globalTarget);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        removed: {
          type: "skill",
          name: "tdd",
          version: "v0.5.1",
          scope: { kind: "global", tools: ["claude"] },
        },
      });
      expect(w.uninstalls).toEqual([{ target: globalTarget, ref: REF }]);
    });

    it("answers a global lockfile that lacks the skill with 404, and runs no uninstall", async () => {
      const w = await world();
      w.seed(globalTarget, [skillEntry("jobs")]);

      const response = await w.remove({ target: globalTarget });

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "not-deployed" });
      expect(w.uninstalls).toEqual([]);
    });

    it("takes no path from the client, even one that is offered", async () => {
      const w = await world();
      w.seed(globalTarget, [skillEntry("tdd")]);

      const response = await w.remove({
        target: { kind: "global", repoPath: "/etc" },
        confirmedRemovalReceipt: await w.receipt(globalTarget),
      });

      expect(response.status).toBe(200);
      expect(w.uninstalls).toEqual([{ target: globalTarget, ref: REF }]);
    });

    it("answers for the detected tools only, leaving an unrelated skill out", async () => {
      const w = await world({ detectedTools: ["claude"] });
      w.seed(globalTarget, [
        skillEntry("tdd", [".claude/skills/tdd/SKILL.md"]),
      ]);
      w.copy(globalTarget, ".claude/skills/tdd/SKILL.md");
      w.copy(globalTarget, ".agents/skills/jobs/SKILL.md");

      expect(await (await w.preflight(globalTarget)).json()).toEqual({
        check: { scope: "global", tools: [{ tool: "claude", warning: null }] },
        reclaim: null,
        receipt: expect.any(String),
      });
    });

    it("refuses when the machine has no supported tool", async () => {
      const w = await world({ detectedTools: [] });
      w.seed(globalTarget, [skillEntry("tdd")]);

      const response = await w.remove({ target: globalTarget });

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "no-supported-tool" });
      expect(w.uninstalls).toEqual([]);
    });
  });

  describe("preflight", () => {
    it("names what a removal would destroy, with nothing removed", async () => {
      const w = await world();
      w.seed(repoTarget, [skillEntry("tdd")]);
      w.copy(repoTarget, ".claude/skills/tdd/SKILL.md");

      const response = await w.preflight(repoTarget);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        check: { scope: "repo", warning: "cannot-verify-local-edits" },
        reclaim: null,
        receipt: expect.stringMatching(/^[0-9a-f]{64}$/),
      });
      expect(w.uninstalls).toEqual([]);
    });

    // Refused, never priced: apm 0.29.0 aborts part-way through (#775).
    it("refuses a copy with local edits, offering nothing to confirm", async () => {
      const w = await world();
      w.seed(repoTarget, [skillEntry("tdd", [".claude/skills/tdd/SKILL.md"])]);
      w.copy(repoTarget, ".claude/skills/tdd/SKILL.md", "# tdd, edited\n");

      const response = await w.preflight(repoTarget);

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        error: "deployed-diverged-from-lock",
      });
    });

    it("refuses an unregistered repo, so it cannot probe a lockfile", async () => {
      const w = await world();

      const response = await w.preflight({
        kind: "repo",
        repoPath: "/work/other",
      });

      expect(response.status).toBe(403);
    });

    it("rejects a body that is not the expected shape", async () => {
      const w = await world();

      const response = await w.post("/api/deploy/remove/preflight", {
        name: "tdd",
      });

      expect(response.status).toBe(400);
    });
  });
});
