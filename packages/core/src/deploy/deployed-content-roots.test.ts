import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { DeployTarget } from "./deploy-skill";
import {
  resolveDeployedLockfilePath,
  resolveDeployedRoot,
} from "./deployed-content-roots";

// The destination guard reads two roots per target: where the deployed files
// live (keys in deployed_file_hashes are relative to it) and where the lockfile
// holding those hashes lives. For a repo both sit in the repo; for global they
// differ — the lockfile is under ~/.apm but the files are under HOME, since apm
// keys the global deployed_file_hashes HOME-relative (apm-driver.md, #61).
describe("destination-guard root resolution", () => {
  const repo: DeployTarget = { kind: "repo", repoPath: "/work/my-repo" };
  const global: DeployTarget = { kind: "global" };
  const env = { HOME: "/sandbox-home" } as NodeJS.ProcessEnv;

  it("resolves a repo's deployed root to the repo path", () => {
    expect(resolveDeployedRoot(repo, env)).toBe("/work/my-repo");
  });

  it("resolves the global deployed root to HOME, where apm keys the hashes", () => {
    expect(resolveDeployedRoot(global, env)).toBe("/sandbox-home");
  });

  it("resolves a repo's lockfile path to apm.lock.yaml in the repo", () => {
    expect(resolveDeployedLockfilePath(repo, env)).toBe(
      join("/work/my-repo", "apm.lock.yaml"),
    );
  });

  it("resolves the global lockfile path to ~/.apm/apm.lock.yaml", () => {
    expect(resolveDeployedLockfilePath(global, env)).toBe(
      join("/sandbox-home", ".apm", "apm.lock.yaml"),
    );
  });
});
