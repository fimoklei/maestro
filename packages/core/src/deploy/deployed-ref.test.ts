import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import type { LockfileEntry } from "../lockfile/lockfile";
import { InMemoryFileSystem } from "../registry/file-system.fake";
import { DeployedLocation } from "./deployed-location";
import { DeployedRefAdapter } from "./deployed-ref";

const target = { kind: "repo", repoPath: "/repo" } as const;
const location = new DeployedLocation({});

const resolve = (entries: LockfileEntry[], name: string) =>
  new DeployedRefAdapter({
    fs: new InMemoryFileSystem({
      files: {
        [location.lockfilePath(target)]: stringify({ dependencies: entries }),
      },
    }),
    location,
  }).resolve({ target, name });

const tddEntry: LockfileEntry = {
  host: "github.com",
  repo_url: "fimoklei/agent-harness",
  resolved_ref: "v0.5.1",
  virtual_path: ".apm/skills/tdd",
  package_type: "claude_skill",
};

describe("DeployedRefAdapter.resolve", () => {
  it("rebuilds the tag-pinned ref the install used", async () => {
    expect(await resolve([tddEntry], "tdd")).toEqual({
      ok: true,
      ref: "github.com/fimoklei/agent-harness/.apm/skills/tdd#v0.5.1",
      version: "v0.5.1",
    });
  });

  it("names the pinned version alongside the ref", async () => {
    const lookup = await resolve([tddEntry], "tdd");

    expect(lookup.ok && lookup.version).toBe("v0.5.1");
  });

  it("picks the entry whose name matches, not the first one", async () => {
    const jobsEntry: LockfileEntry = {
      ...tddEntry,
      resolved_ref: "v0.4.0",
      virtual_path: ".apm/skills/jobs",
    };
    expect(await resolve([jobsEntry, tddEntry], "tdd")).toEqual({
      ok: true,
      ref: "github.com/fimoklei/agent-harness/.apm/skills/tdd#v0.5.1",
      version: "v0.5.1",
    });
  });

  it("reports a skill the lockfile does not carry as not deployed", async () => {
    expect(await resolve([tddEntry], "jobs")).toEqual({
      ok: false,
      reason: "not-deployed",
    });
  });

  it("reports a target with no lockfile at all as not deployed", async () => {
    const lookup = await new DeployedRefAdapter({
      fs: new InMemoryFileSystem(),
      location,
    }).resolve({ target, name: "tdd" });

    expect(lookup).toEqual({ ok: false, reason: "not-deployed" });
  });

  it("ignores an entry of an unsupported package type", async () => {
    const hookEntry: LockfileEntry = {
      ...tddEntry,
      package_type: "claude_hook",
      virtual_path: ".apm/hooks/tdd",
    };
    expect(await resolve([hookEntry], "tdd")).toEqual({
      ok: false,
      reason: "not-deployed",
    });
  });

  it("refuses to guess a ref when the entry names no origin repo", async () => {
    const { repo_url: _dropped, ...withoutRepo } = tddEntry;
    expect(await resolve([withoutRepo], "tdd")).toEqual({
      ok: false,
      reason: "ref-unresolvable",
    });
  });

  it("refuses to guess a ref when the entry names no host", async () => {
    const { host: _dropped, ...withoutHost } = tddEntry;
    expect(await resolve([withoutHost], "tdd")).toEqual({
      ok: false,
      reason: "ref-unresolvable",
    });
  });

  // A lockfile is a file in the user's repo, so its ref must name the row's own
  // skill or nothing is removed.

  it("refuses an entry whose path is not this skill's own .apm/skills/ path", async () => {
    // basename() alone would accept this.
    const elsewhere: LockfileEntry = {
      ...tddEntry,
      virtual_path: "vendor/other/tdd",
    };
    expect(await resolve([elsewhere], "tdd")).toEqual({
      ok: false,
      reason: "ref-unresolvable",
    });
  });

  it("refuses an entry written against the retired root skills/ path", async () => {
    const retired: LockfileEntry = { ...tddEntry, virtual_path: "skills/tdd" };
    expect(await resolve([retired], "tdd")).toEqual({
      ok: false,
      reason: "ref-unresolvable",
    });
  });

  it("refuses an entry hosted anywhere but GitHub", async () => {
    const elsewhere: LockfileEntry = { ...tddEntry, host: "evil.example.com" };
    expect(await resolve([elsewhere], "tdd")).toEqual({
      ok: false,
      reason: "ref-unresolvable",
    });
  });

  it("refuses an entry whose repo is not a plain owner/repo", async () => {
    const odd: LockfileEntry = { ...tddEntry, repo_url: "../../etc/passwd" };
    expect(await resolve([odd], "tdd")).toEqual({
      ok: false,
      reason: "ref-unresolvable",
    });
  });

  it("refuses an entry that is not pinned to a version tag", async () => {
    const unpinned: LockfileEntry = { ...tddEntry, resolved_ref: "main" };
    expect(await resolve([unpinned], "tdd")).toEqual({
      ok: false,
      reason: "ref-unresolvable",
    });
  });

  it("refuses when two entries both claim the same skill", async () => {
    const duplicate: LockfileEntry = {
      ...tddEntry,
      repo_url: "someone-else/harness",
    };
    expect(await resolve([tddEntry, duplicate], "tdd")).toEqual({
      ok: false,
      reason: "ref-unresolvable",
    });
  });
});
