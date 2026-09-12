import { describe, expect, it } from "vitest";
import type { DeployedContentState, DeployTarget } from "./deploy-skill";
import type { SupportedTool } from "./deploy-tools";
import { LocalCopyGuard } from "./local-copy-guard";

const repo: DeployTarget = { kind: "repo", repoPath: "/repo" };
const globalTarget: DeployTarget = { kind: "global" };

// Keyed by `${name}:${tool ?? ""}`, so a fake can answer one copy differently
// from another without growing a second stub.
function guardOver(
  states: Record<string, DeployedContentState | "throws">,
  fallback: DeployedContentState = "clean",
) {
  const calls: { name: string; tools?: readonly SupportedTool[] }[] = [];
  const guard = new LocalCopyGuard({
    content: {
      classify: async (input) => {
        calls.push({ name: input.name, tools: input.tools });
        const key = `${input.name}:${input.tools?.[0] ?? ""}`;
        const state = states[key] ?? fallback;
        if (state === "throws") {
          throw new Error("unreadable");
        }
        return state;
      },
    },
  });
  return { guard, calls };
}

describe("LocalCopyGuard", () => {
  it("admits a write over copies that are all clean", async () => {
    const { guard } = guardOver({});
    const scope = { write: "deploy", target: repo } as const;
    const check = await guard.check({ ...scope, names: ["tdd", "grill"] });

    expect(check.findings).toEqual([
      { name: "tdd", tool: null, verdict: "clean" },
      { name: "grill", tool: null, verdict: "clean" },
    ]);
    expect(guard.admits(scope, check)).toEqual({ ok: true });
  });

  it("reads a copy with nothing on disk as clean", async () => {
    const { guard } = guardOver({ "tdd:": "not-deployed" });
    const scope = { write: "deploy", target: repo } as const;
    const check = await guard.check({ ...scope, names: ["tdd"] });

    expect(guard.admits(scope, check)).toEqual({ ok: true });
  });

  it("blocks a locally edited copy until its own receipt comes back", async () => {
    const { guard } = guardOver({ "tdd:": "diverged" });
    const scope = { write: "deploy", target: repo } as const;
    const check = await guard.check({ ...scope, names: ["tdd"] });

    const refused = guard.admits(scope, check);
    expect(refused.ok).toBe(false);
    if (refused.ok) {
      return;
    }
    expect(refused.blocked).toBe("local-edits");
    expect(refused.receipt).toMatch(/^[0-9a-f]{64}$/);
    expect(guard.admits(scope, check, refused.receipt ?? undefined)).toEqual({
      ok: true,
    });
  });

  it("blocks a copy with no recorded hashes as unverified", async () => {
    const { guard } = guardOver({ "tdd:": "unverifiable" });
    const scope = { write: "deploy", target: repo } as const;
    const check = await guard.check({ ...scope, names: ["tdd"] });

    const refused = guard.admits(scope, check);
    expect(refused.ok).toBe(false);
    if (refused.ok) {
      return;
    }
    expect(refused.blocked).toBe("unverified");
    expect(guard.admits(scope, check, refused.receipt ?? undefined)).toEqual({
      ok: true,
    });
  });

  it("refuses a receipt once the content behind it changed", async () => {
    const states: Record<string, DeployedContentState> = {
      "tdd:": "unverifiable",
    };
    const guard = new LocalCopyGuard({
      content: {
        classify: async (input) => states[`${input.name}:`] ?? "clean",
      },
    });
    const scope = { write: "deploy", target: repo } as const;
    const priced = await guard.check({ ...scope, names: ["tdd"] });
    const receipt = guard.receipt(scope, priced);

    // Someone edits the copy between the refusal and the confirmation.
    states["tdd:"] = "diverged";
    const fresh = await guard.check({ ...scope, names: ["tdd"] });
    expect(guard.admits(scope, fresh, receipt).ok).toBe(false);
    expect(guard.admits(scope, priced, receipt).ok).toBe(true);
  });

  it("refuses a receipt minted for another write", async () => {
    const { guard } = guardOver({ "tdd:": "diverged" });
    const deploy = { write: "deploy", target: repo } as const;
    const remove = { write: "remove", target: repo } as const;
    const check = await guard.check({ ...deploy, names: ["tdd"] });

    expect(guard.admits(remove, check, guard.receipt(deploy, check)).ok).toBe(
      false,
    );
  });

  it("refuses a receipt minted for another skill", async () => {
    const { guard } = guardOver({ "tdd:": "diverged", "grill:": "diverged" });
    const scope = { write: "deploy", target: repo } as const;
    const tdd = await guard.check({ ...scope, names: ["tdd"] });
    const grill = await guard.check({ ...scope, names: ["grill"] });

    expect(guard.admits(scope, grill, guard.receipt(scope, tdd)).ok).toBe(
      false,
    );
  });

  it("refuses a receipt minted for another target", async () => {
    const { guard } = guardOver({ "tdd:": "diverged" });
    const here = { write: "deploy", target: repo } as const;
    const elsewhere = {
      write: "deploy",
      target: { kind: "repo", repoPath: "/other" },
    } as const;
    const check = await guard.check({ ...here, names: ["tdd"] });

    expect(guard.admits(elsewhere, check, guard.receipt(here, check)).ok).toBe(
      false,
    );
  });

  it("blocks an unreadable copy with no receipt to get past it", async () => {
    const { guard } = guardOver({ "tdd:": "unreadable" });
    const scope = { write: "deploy", target: repo } as const;
    const check = await guard.check({ ...scope, names: ["tdd"] });

    const refused = guard.admits(scope, check);
    expect(refused).toEqual({
      ok: false,
      blocked: "unreadable",
      check,
      receipt: null,
    });
  });

  it("blocks a malformed lockfile with no receipt to get past it", async () => {
    const { guard } = guardOver({ "tdd:": "lockfile-malformed" });
    const scope = { write: "deploy", target: repo } as const;
    const check = await guard.check({ ...scope, names: ["tdd"] });

    expect(guard.admits(scope, check).ok).toBe(false);
    if (guard.admits(scope, check).ok) {
      return;
    }
    expect(guard.admits(scope, check)).toMatchObject({
      blocked: "lockfile-malformed",
      receipt: null,
    });
  });

  it("reads a check that threw as unreadable, never as a clean copy", async () => {
    const { guard } = guardOver({ "tdd:": "throws" });
    const scope = { write: "deploy", target: repo } as const;
    const check = await guard.check({ ...scope, names: ["tdd"] });

    expect(check.findings).toEqual([
      { name: "tdd", tool: null, verdict: "unreadable" },
    ]);
  });

  it("lets an unreadable copy outrank an edited one in the same check", async () => {
    const { guard } = guardOver({
      "tdd:": "diverged",
      "grill:": "unreadable",
    });
    const scope = { write: "deploy", target: repo } as const;
    const check = await guard.check({ ...scope, names: ["tdd", "grill"] });

    expect(guard.admits(scope, check)).toMatchObject({
      blocked: "unreadable",
      receipt: null,
    });
  });

  it("asks once per tool so consent covers every copy at risk", async () => {
    const { guard, calls } = guardOver({ "tdd:codex": "diverged" });
    const scope = { write: "deploy", target: globalTarget } as const;
    const check = await guard.check({
      ...scope,
      names: ["tdd"],
      tools: ["claude", "codex"],
    });

    expect(calls).toEqual([
      { name: "tdd", tools: ["claude"] },
      { name: "tdd", tools: ["codex"] },
    ]);
    expect(check.findings).toEqual([
      { name: "tdd", tool: "claude", verdict: "clean" },
      { name: "tdd", tool: "codex", verdict: "local-edits" },
    ]);
    const refused = guard.admits(scope, check);
    expect(refused.ok).toBe(false);
  });

  it("refuses a receipt that covered fewer tools than the write touches", async () => {
    const { guard } = guardOver({
      "tdd:claude": "diverged",
      "tdd:codex": "diverged",
    });
    const scope = { write: "deploy", target: globalTarget } as const;
    const oneTool = await guard.check({
      ...scope,
      names: ["tdd"],
      tools: ["claude"],
    });
    const bothTools = await guard.check({
      ...scope,
      names: ["tdd"],
      tools: ["claude", "codex"],
    });

    expect(
      guard.admits(scope, bothTools, guard.receipt(scope, oneTool)).ok,
    ).toBe(false);
  });

  it("passes the chosen release to the classifier, so an equal copy can pass", async () => {
    const releases: (string | undefined)[] = [];
    const guard = new LocalCopyGuard({
      content: {
        classify: async (input) => {
          releases.push(input.release);
          return "clean";
        },
      },
    });

    await guard.check({
      write: "deploy",
      target: repo,
      names: ["tdd"],
      release: "v0.3.4",
    });
    expect(releases).toEqual(["v0.3.4"]);
  });

  it("takes a malformed receipt as no consent at all", async () => {
    const { guard } = guardOver({ "tdd:": "diverged" });
    const scope = { write: "deploy", target: repo } as const;
    const check = await guard.check({ ...scope, names: ["tdd"] });

    expect(guard.admits(scope, check, "not-a-token").ok).toBe(false);
  });
});
