import { describe, expect, it } from "vitest";
import { InMemoryFileSystem } from "../registry/file-system.fake";
import { RecordedPackageAdapter } from "./recorded-package";

const REPO = "/repo";
const LOCKFILE = `${REPO}/apm.lock.yaml`;
const target = { kind: "repo" as const, repoPath: REPO };

function lockfile(virtualPath: string, packageType: string): string {
  return `lockfile_version: '1'\napm_version: 0.26.0\ndependencies:\n- repo_url: fimoklei/agent-harness\n  host: github.com\n  resolved_ref: v0.5.0\n  virtual_path: ${virtualPath}\n  package_type: ${packageType}\n`;
}

function adapter(files: Record<string, string>) {
  return new RecordedPackageAdapter({
    fs: new InMemoryFileSystem({ files }),
    location: { lockfilePath: () => LOCKFILE },
  });
}

describe("RecordedPackageAdapter", () => {
  it("reads the package_type apm recorded for the deployed skill", async () => {
    const read = adapter({ [LOCKFILE]: lockfile("skills/tdd", "invalid") });

    await expect(read.read({ target, name: "tdd" })).resolves.toBe("invalid");
  });

  it("answers null when no lockfile exists", async () => {
    await expect(adapter({}).read({ target, name: "tdd" })).resolves.toBeNull();
  });

  it("answers null when the lockfile cannot be parsed", async () => {
    const read = adapter({ [LOCKFILE]: "dependencies: not-a-list\n" });

    await expect(read.read({ target, name: "tdd" })).resolves.toBeNull();
  });

  it("does not let another package's entry answer for the skill", async () => {
    const read = adapter({ [LOCKFILE]: lockfile("hooks/tdd", "claude_hook") });

    await expect(read.read({ target, name: "tdd" })).resolves.toBeNull();
  });
});
