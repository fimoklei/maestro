import { describe, expect, it } from "vitest";
import {
  APM_DEPLOY_TARGET_FLAG,
  apmTargetFlagForTools,
  DEPLOY_TOOLS,
  deployTargetSubtrees,
  untargetedTools,
} from "./deploy-tools";

// One fact — which tools a skill deploy targets — feeds two consumers: the apm
// driver's `-t` flag and the destination guard's scanned subtrees. These tests
// pin the coupling so the two cannot drift (#63): the flag and the subtrees are
// both derived from DEPLOY_TOOLS, never hand-listed.
describe("deploy tools", () => {
  it("builds the apm -t flag from every tool's apm target", () => {
    expect(APM_DEPLOY_TARGET_FLAG).toBe(
      DEPLOY_TOOLS.map((tool) => tool.apmTarget).join(","),
    );
  });

  it("preserves the apm 0.20.0 install flag value", () => {
    // The exact string apm install expects (-t claude,codex). Pinned so a
    // refactor of the source-of-truth cannot silently change what apm receives.
    expect(APM_DEPLOY_TARGET_FLAG).toBe("claude,codex");
  });

  it("yields one deployed subtree per tool for a skill name", () => {
    const subtrees = deployTargetSubtrees("tdd");
    expect(subtrees).toHaveLength(DEPLOY_TOOLS.length);
    expect(subtrees).toEqual(
      DEPLOY_TOOLS.map((tool) => `${tool.skillsDirPrefix}/skills/tdd`),
    );
  });

  it("scans the .claude and .agents copies a two-tool install writes", () => {
    // apm deploys claude to .claude and codex to the cross-client .agents dir
    // (not .codex) — apm-driver.md. The guard must scan exactly those.
    expect(deployTargetSubtrees("tdd")).toEqual([
      ".claude/skills/tdd",
      ".agents/skills/tdd",
    ]);
  });

  it("scopes the scanned subtrees to a given tool set", () => {
    // The GLOBAL destination guard must scan only the tools the deploy targets
    // (ADR-0011, #136). A Claude-only redeploy over a prior two-tool lockfile
    // must not scan .agents — otherwise the absent .agents copy reads as drift.
    expect(deployTargetSubtrees("tdd", ["claude"])).toEqual([
      ".claude/skills/tdd",
    ]);
    expect(deployTargetSubtrees("tdd", ["codex"])).toEqual([
      ".agents/skills/tdd",
    ]);
  });

  it("filters and orders the scoped subtrees against DEPLOY_TOOLS", () => {
    // An out-of-order or unknown token cannot change the subtree set or its
    // order — the single source of truth owns both (mirrors apmTargetFlagForTools).
    expect(deployTargetSubtrees("tdd", ["codex", "claude"])).toEqual([
      ".claude/skills/tdd",
      ".agents/skills/tdd",
    ]);
  });

  it("defaults to every tool's subtree when no set is given", () => {
    // Absent tools = the repo path and the #111 read-path, which target every
    // DEPLOY_TOOLS tool — the pre-#136 behaviour must be unchanged.
    expect(deployTargetSubtrees("tdd")).toEqual(
      deployTargetSubtrees("tdd", ["claude", "codex"]),
    );
  });

  it("carries a deploy-immune presence marker per tool", () => {
    // The signal is the tool's own config file (spike #127), never a skills dir
    // a Maestro deploy would create — otherwise a past deploy reads back as an
    // installed tool (ADR-0011). Pinned so the trap cannot creep back in.
    expect(
      DEPLOY_TOOLS.map((tool) => [tool.apmTarget, tool.globalPresenceMarker]),
    ).toEqual([
      ["claude", ".claude.json"],
      ["codex", ".codex/config.toml"],
    ]);
  });
});

// The global `-t` value is built from the tools detected on the machine, not the
// always-both constant (ADR-0011). It stays derived from DEPLOY_TOOLS so the
// token set and its order remain owned by the single source of truth (#131).
describe("apmTargetFlagForTools", () => {
  it("emits every detected tool's token in DEPLOY_TOOLS order", () => {
    expect(apmTargetFlagForTools(["codex", "claude"])).toBe("claude,codex");
  });

  it("emits a single token for a single-tool machine (no dead .agents)", () => {
    expect(apmTargetFlagForTools(["claude"])).toBe("claude");
    expect(apmTargetFlagForTools(["codex"])).toBe("codex");
  });

  it("is empty when no supported tool is detected", () => {
    expect(apmTargetFlagForTools([])).toBe("");
  });
});

// The tools a global deploy must reconcile away: every DEPLOY_TOOLS tool the
// machine does NOT have, so their obsolete deployed copy is removed when a
// global deploy narrows the target set (ADR-0011, #136).
describe("untargetedTools", () => {
  it("returns the tools not in the detected set, in DEPLOY_TOOLS order", () => {
    // A Claude-only machine leaves codex obsolete; its dead .agents copy is
    // what a narrowing global deploy removes.
    expect(untargetedTools(["claude"])).toEqual(["codex"]);
    expect(untargetedTools(["codex"])).toEqual(["claude"]);
  });

  it("is empty when every supported tool is detected", () => {
    // A full two-tool machine narrows nothing away.
    expect(untargetedTools(["claude", "codex"])).toEqual([]);
  });

  it("returns every tool when none is detected", () => {
    expect(untargetedTools([])).toEqual(DEPLOY_TOOLS.map((t) => t.apmTarget));
  });
});
