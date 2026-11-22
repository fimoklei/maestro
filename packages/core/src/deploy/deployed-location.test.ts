import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { DeployTarget } from "./deploy-skill";
import { DeployedLocation } from "./deployed-location";

describe("DeployedLocation", () => {
  const repo: DeployTarget = { kind: "repo", repoPath: "/work/my-repo" };
  const global: DeployTarget = { kind: "global" };
  const location = new DeployedLocation(
    { HOME: "/sandbox-home" } as NodeJS.ProcessEnv,
    (path) => path,
  );

  it("resolves a repo's tree root to the repo path", () => {
    expect(location.treeRoot(repo)).toBe("/work/my-repo");
  });

  it("resolves the global tree root to HOME, where apm keys the hashes", () => {
    expect(location.treeRoot(global)).toBe("/sandbox-home");
  });

  it("resolves a repo's lockfile path to apm.lock.yaml in the repo", () => {
    expect(location.lockfilePath(repo)).toBe(
      join("/work/my-repo", "apm.lock.yaml"),
    );
  });

  it("resolves the global lockfile path to ~/.apm/apm.lock.yaml", () => {
    expect(location.lockfilePath(global)).toBe(
      join("/sandbox-home", ".apm", "apm.lock.yaml"),
    );
  });

  it("reads a repo's skills from the default folders, whatever the variable says", () => {
    const moved = new DeployedLocation(
      { HOME: "/sandbox-home", CLAUDE_CONFIG_DIR: "/elsewhere" },
      (path) => path,
    );
    expect(moved.toolRoots(repo)).toStrictEqual({
      claude: ".claude",
      codex: ".agents",
    });
  });

  it("reads Global's Claude Code folder and marker from CLAUDE_CONFIG_DIR, set after startup", () => {
    const env: NodeJS.ProcessEnv = { HOME: "/sandbox-home" };
    const moving = new DeployedLocation(env, (path) => path);
    expect(moving.presenceMarkers().claude).toBe("/sandbox-home/.claude.json");

    env.CLAUDE_CONFIG_DIR = "/sandbox-home/.claude-work";
    expect(moving.toolRoots(global)).toStrictEqual({
      claude: ".claude-work",
      codex: ".agents",
    });
    expect(moving.presenceMarkers()).toStrictEqual({
      claude: "/sandbox-home/.claude-work/.claude.json",
      codex: "/sandbox-home/.codex/config.toml",
    });
    expect(moving.globalLayout().roots.claude).toBe(".claude-work");
  });
});
