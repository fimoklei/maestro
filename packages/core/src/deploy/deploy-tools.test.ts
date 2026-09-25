import { describe, expect, it } from "vitest";
import {
  APM_DEPLOY_TARGET_FLAG,
  apmTargetFlagForTools,
  DEPLOY_TOOLS,
  deployTargetSubtrees,
  reclaimableUntargetedTools,
} from "./deploy-tools";

// The apm `-t` flag and the guard's scanned subtrees both derive from
// DEPLOY_TOOLS, so they cannot drift (#63).
describe("deploy tools", () => {
  it("builds the apm -t flag from every tool's apm target", () => {
    expect(APM_DEPLOY_TARGET_FLAG).toBe(
      DEPLOY_TOOLS.map((tool) => tool.apmTarget).join(","),
    );
  });

  it("preserves the apm 0.20.0 install flag value", () => {
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
    // apm deploys codex to the cross-client .agents dir, not .codex.
    expect(deployTargetSubtrees("tdd")).toEqual([
      ".claude/skills/tdd",
      ".agents/skills/tdd",
    ]);
  });

  it("scopes the scanned subtrees to a given tool set", () => {
    // Scanning .agents on a Claude-only redeploy reads the absent copy as drift (#136).
    expect(deployTargetSubtrees("tdd", ["claude"])).toEqual([
      ".claude/skills/tdd",
    ]);
    expect(deployTargetSubtrees("tdd", ["codex"])).toEqual([
      ".agents/skills/tdd",
    ]);
  });

  it("filters and orders the scoped subtrees against DEPLOY_TOOLS", () => {
    expect(deployTargetSubtrees("tdd", ["codex", "claude"])).toEqual([
      ".claude/skills/tdd",
      ".agents/skills/tdd",
    ]);
  });

  it("defaults to every tool's subtree when no set is given", () => {
    expect(deployTargetSubtrees("tdd")).toEqual(
      deployTargetSubtrees("tdd", ["claude", "codex"]),
    );
  });

  it("carries a deploy-immune presence marker per tool", () => {
    // A skills dir would read a past Maestro deploy back as an installed tool (#127).
    expect(
      DEPLOY_TOOLS.map((tool) => [tool.apmTarget, tool.globalPresenceMarker]),
    ).toEqual([
      ["claude", ".claude.json"],
      ["codex", ".codex/config.toml"],
    ]);
  });
});

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

// An undetected tool proves its own copy unread, never a directory it shares (#202).
describe("reclaimableUntargetedTools", () => {
  it("returns an undetected tool whose skills directory only it reads", () => {
    expect(reclaimableUntargetedTools(["codex"])).toEqual(["claude"]);
  });

  it("omits an undetected tool that shares its skills directory", () => {
    // Other apm targets deploy under .agents too, so an absent Codex proves nothing.
    expect(reclaimableUntargetedTools(["claude"])).toEqual([]);
  });

  it("is empty when every supported tool is detected", () => {
    expect(reclaimableUntargetedTools(["claude", "codex"])).toEqual([]);
  });

  it("reclaims only the exclusive directory when no tool is detected", () => {
    expect(reclaimableUntargetedTools([])).toEqual(["claude"]);
  });
});

describe("skills directory exclusivity", () => {
  it("marks .claude as exclusive and .agents as shared", () => {
    expect(
      DEPLOY_TOOLS.map((tool) => [
        tool.skillsDirPrefix,
        tool.skillsDirIsExclusive,
      ]),
    ).toEqual([
      [".claude", true],
      [".agents", false],
    ]);
  });
});
