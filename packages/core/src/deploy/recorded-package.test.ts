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

    await expect(read.read({ target, name: "tdd" })).resolves.toEqual({
      kind: "recorded",
      reading: { kind: "invalid", packageType: "invalid" },
    });
  });

  it("leaves a missing lockfile unverified, never recorded", async () => {
    await expect(adapter({}).read({ target, name: "tdd" })).resolves.toEqual({
      kind: "unverified",
    });
  });

  it("leaves a lockfile it cannot parse unverified", async () => {
    const read = adapter({ [LOCKFILE]: "dependencies: not-a-list\n" });

    await expect(read.read({ target, name: "tdd" })).resolves.toEqual({
      kind: "unverified",
    });
  });

  it("reads an entry a harness recorded under its own subpath", async () => {
    const read = adapter({
      [LOCKFILE]: lockfile(".apm/skills/tdd", "hybrid"),
    });

    await expect(read.read({ target, name: "tdd" })).resolves.toEqual({
      kind: "recorded",
      reading: { kind: "unsupported", packageType: "hybrid" },
    });
  });

  it("does not let another skill's entry answer for this one", async () => {
    const read = adapter({ [LOCKFILE]: lockfile("skills/review", "invalid") });

    await expect(read.read({ target, name: "tdd" })).resolves.toEqual({
      kind: "unverified",
    });
  });
});
