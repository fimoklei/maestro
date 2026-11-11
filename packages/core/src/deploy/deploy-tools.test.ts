import { describe, expect, it } from "vitest";
import {
  APM_DEPLOY_TARGET_FLAG,
  apmTargetFlagForTools,
  DEPLOY_TOOLS,
  deployTargetSubtrees,
  globalFolders,
  REPO_TOOL_ROOTS,
  resolveGlobalLayout,
} from "./deploy-tools";

const DEFAULT_LAYOUT = resolveGlobalLayout({
  env: {},
  home: "/Users/ada",
  apmCwd: "/Users/ada/.maestro/.apm-scratch",
  realpath: (path) => path,
});

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
    const subtrees = deployTargetSubtrees("tdd", REPO_TOOL_ROOTS);
    expect(subtrees).toHaveLength(DEPLOY_TOOLS.length);
    expect(subtrees).toEqual(
      DEPLOY_TOOLS.map((tool) => `${tool.skillsDirPrefix}/skills/tdd`),
    );
  });

  it("scans the .claude and .agents copies a two-tool install writes", () => {
    // apm deploys codex to the cross-client .agents dir, not .codex.
    expect(deployTargetSubtrees("tdd", REPO_TOOL_ROOTS)).toEqual([
      ".claude/skills/tdd",
      ".agents/skills/tdd",
    ]);
  });

  it("scopes the scanned subtrees to a given tool set", () => {
    // Scanning .agents on a Claude-only redeploy reads the absent copy as drift (#136).
    expect(deployTargetSubtrees("tdd", REPO_TOOL_ROOTS, ["claude"])).toEqual([
      ".claude/skills/tdd",
    ]);
    expect(deployTargetSubtrees("tdd", REPO_TOOL_ROOTS, ["codex"])).toEqual([
      ".agents/skills/tdd",
    ]);
  });

  it("filters and orders the scoped subtrees against DEPLOY_TOOLS", () => {
    expect(
      deployTargetSubtrees("tdd", REPO_TOOL_ROOTS, ["codex", "claude"]),
    ).toEqual([".claude/skills/tdd", ".agents/skills/tdd"]);
  });

  it("defaults to every tool's subtree when no set is given", () => {
    expect(deployTargetSubtrees("tdd", REPO_TOOL_ROOTS)).toEqual(
      deployTargetSubtrees("tdd", REPO_TOOL_ROOTS, ["claude", "codex"]),
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

describe("globalFolders", () => {
  it("lists every Global folder by home-relative path, with the tool that writes it", () => {
    expect(globalFolders(["claude"], DEFAULT_LAYOUT)).toStrictEqual([
      { path: "~/.claude/skills", tool: "claude", detected: true },
      { path: "~/.agents/skills", tool: "codex", detected: false },
    ]);
  });

  it("marks a folder written only where its tool is detected", () => {
    expect(
      globalFolders(["codex", "claude"], DEFAULT_LAYOUT).map((f) => f.detected),
    ).toEqual([true, true]);
    expect(globalFolders([], DEFAULT_LAYOUT).map((f) => f.detected)).toEqual([
      false,
      false,
    ]);
  });
});

// apm 0.32.0 moves Claude Code's user-scope folder into CLAUDE_CONFIG_DIR and
// records it home-relative inside HOME, absolute outside it (#1796).
describe("resolveGlobalLayout", () => {
  const layoutFor = (
    value: string | undefined,
    realpath: (path: string) => string = (path) => path,
  ) =>
    resolveGlobalLayout({
      env: value === undefined ? {} : { CLAUDE_CONFIG_DIR: value },
      home: "/Users/ada",
      apmCwd: "/Users/ada/.maestro/.apm-scratch",
      realpath,
    });

  it("keeps the default folders and markers while the variable is unset", () => {
    expect(layoutFor(undefined)).toStrictEqual({
      roots: { claude: ".claude", codex: ".agents" },
      markers: { claude: ".claude.json", codex: ".codex/config.toml" },
    });
  });

  it("treats a blank variable as unset, as apm does", () => {
    expect(layoutFor("  ")).toStrictEqual(layoutFor(undefined));
  });

  it("moves Claude Code's folder and marker home-relative inside HOME", () => {
    expect(layoutFor("/Users/ada/.claude-work")).toStrictEqual({
      roots: { claude: ".claude-work", codex: ".agents" },
      markers: {
        claude: ".claude-work/.claude.json",
        codex: ".codex/config.toml",
      },
    });
  });

  it("keeps an absolute folder outside HOME", () => {
    expect(layoutFor("/Volumes/work/claude/").roots.claude).toBe(
      "/Volumes/work/claude",
    );
    expect(layoutFor("/Volumes/work/claude").markers.claude).toBe(
      "/Volumes/work/claude/.claude.json",
    );
  });

  it("expands a leading tilde and resolves a relative value against apm's cwd", () => {
    expect(layoutFor("~/.claude-work").roots.claude).toBe(".claude-work");
    expect(layoutFor("work/../claude").roots.claude).toBe(
      ".maestro/.apm-scratch/claude",
    );
  });

  it("compares the resolved folder with the resolved home, as apm does", () => {
    const realpath = (path: string) => path.replace(/^\/link/, "/Users/ada");
    expect(layoutFor("/link/.claude-work", realpath).roots.claude).toBe(
      ".claude-work",
    );
  });
});

describe("Global folder names under a moved folder", () => {
  const moved = {
    roots: { claude: "/Volumes/work/claude", codex: ".agents" },
    markers: {
      claude: "/Volumes/work/claude/.claude.json",
      codex: ".codex/config.toml",
    },
  };

  it("names an absolute folder in full and a home folder from ~/", () => {
    expect(globalFolders(["claude"], moved).map((f) => f.path)).toEqual([
      "/Volumes/work/claude/skills",
      "~/.agents/skills",
    ]);
  });

  it("scopes a skill's subtrees to the moved folder", () => {
    expect(deployTargetSubtrees("tdd", moved.roots, ["claude"])).toEqual([
      "/Volumes/work/claude/skills/tdd",
    ]);
  });
});
