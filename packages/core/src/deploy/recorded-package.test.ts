import { describe, expect, it } from "vitest";
import { InMemoryCopyTree } from "../filesystem/copy-tree-fs.fake";
import { DeployedContentAdapter } from "./deployed-content";
import { RecordedPackageAdapter } from "./recorded-package";

const REPO = "/repo";
const LOCKFILE = `${REPO}/apm.lock.yaml`;
const target = { kind: "repo" as const, repoPath: REPO };

function lockfile(virtualPath: string, packageType: string): string {
  return `lockfile_version: '1'\napm_version: 0.26.0\ndependencies:\n- repo_url: fimoklei/agent-harness\n  host: github.com\n  resolved_ref: v0.5.0\n  virtual_path: ${virtualPath}\n  package_type: ${packageType}\n`;
}

// What the recorded read answers for `tdd`, given the raw lockfile or none.
async function recordedTdd(raw: string | null) {
  const tree = new InMemoryCopyTree();
  if (raw !== null) {
    tree.write(LOCKFILE, raw);
  }
  const lockfile = await new DeployedContentAdapter({
    location: { treeRoot: () => REPO, lockfilePath: () => LOCKFILE },
    fs: tree,
  }).readLockfile(target);
  return new RecordedPackageAdapter().read({ lockfile, name: "tdd" });
}

describe("RecordedPackageAdapter", () => {
  it("reads the package_type apm recorded for the deployed skill", async () => {
    await expect(
      recordedTdd(lockfile("skills/tdd", "invalid")),
    ).resolves.toEqual({
      kind: "recorded",
      reading: { kind: "invalid", packageType: "invalid" },
    });
  });

  it("leaves a missing lockfile unverified, never recorded", async () => {
    await expect(recordedTdd(null)).resolves.toEqual({ kind: "unverified" });
  });

  it("leaves a lockfile it cannot parse unverified", async () => {
    await expect(recordedTdd("dependencies: not-a-list\n")).resolves.toEqual({
      kind: "unverified",
    });
  });

  it("reads an entry a harness recorded under its own subpath", async () => {
    await expect(
      recordedTdd(lockfile(".apm/skills/tdd", "hybrid")),
    ).resolves.toEqual({
      kind: "recorded",
      reading: { kind: "unsupported", packageType: "hybrid" },
    });
  });

  it("does not let another skill's entry answer for this one", async () => {
    await expect(
      recordedTdd(lockfile("skills/review", "invalid")),
    ).resolves.toEqual({ kind: "unverified" });
  });
});
