import { describe, expect, it } from "vitest";
import {
  APM_DEPLOY_TARGET_FLAG,
  DEPLOY_TOOLS,
  deployTargetSubtrees,
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
});
