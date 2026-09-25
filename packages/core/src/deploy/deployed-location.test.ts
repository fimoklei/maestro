import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { DeployTarget } from "./deploy-skill";
import { DeployedLocation } from "./deployed-location";

// For global the lockfile is under ~/.apm but the files are under HOME: apm keys
// global deployed_file_hashes HOME-relative (#61).
describe("DeployedLocation", () => {
  const repo: DeployTarget = { kind: "repo", repoPath: "/work/my-repo" };
  const global: DeployTarget = { kind: "global" };
  const location = new DeployedLocation({
    HOME: "/sandbox-home",
  } as NodeJS.ProcessEnv);

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
});
