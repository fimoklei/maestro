import { describe, expect, it } from "vitest";
import type { LockfileEntry } from "../lockfile/lockfile";
import { refForDeployedSkill } from "./deployed-ref";

const tddEntry: LockfileEntry = {
  host: "github.com",
  repo_url: "fimoklei/agent-harness",
  resolved_ref: "v0.5.1",
  virtual_path: ".apm/skills/tdd",
  package_type: "claude_skill",
};

describe("refForDeployedSkill", () => {
  it("rebuilds the tag-pinned ref the install used", () => {
    expect(refForDeployedSkill([tddEntry], "tdd")).toEqual({
      ok: true,
      ref: "github.com/fimoklei/agent-harness/.apm/skills/tdd#v0.5.1",
      version: "v0.5.1",
    });
  });

  it("names the pinned version alongside the ref", () => {
    const lookup = refForDeployedSkill([tddEntry], "tdd");

    expect(lookup.ok && lookup.version).toBe("v0.5.1");
  });

  it("picks the entry whose name matches, not the first one", () => {
    const jobsEntry: LockfileEntry = {
      ...tddEntry,
      resolved_ref: "v0.4.0",
      virtual_path: ".apm/skills/jobs",
    };
    expect(refForDeployedSkill([jobsEntry, tddEntry], "tdd")).toEqual({
      ok: true,
      ref: "github.com/fimoklei/agent-harness/.apm/skills/tdd#v0.5.1",
      version: "v0.5.1",
    });
  });

  it("reports a skill the lockfile does not carry as not deployed", () => {
    expect(refForDeployedSkill([tddEntry], "jobs")).toEqual({
      ok: false,
      reason: "not-deployed",
    });
  });

  it("ignores an entry of an unsupported package type", () => {
    const hookEntry: LockfileEntry = {
      ...tddEntry,
      package_type: "claude_hook",
      virtual_path: ".apm/hooks/tdd",
    };
    expect(refForDeployedSkill([hookEntry], "tdd")).toEqual({
      ok: false,
      reason: "not-deployed",
    });
  });

  it("refuses to guess a ref when the entry names no origin repo", () => {
    const { repo_url: _dropped, ...withoutRepo } = tddEntry;
    expect(refForDeployedSkill([withoutRepo], "tdd")).toEqual({
      ok: false,
      reason: "ref-unresolvable",
    });
  });

  it("refuses to guess a ref when the entry names no host", () => {
    const { host: _dropped, ...withoutHost } = tddEntry;
    expect(refForDeployedSkill([withoutHost], "tdd")).toEqual({
      ok: false,
      reason: "ref-unresolvable",
    });
  });

  // A lockfile is a file in the user's repo, so its ref must name the row's own
  // skill or nothing is removed.

  it("refuses an entry whose path is not this skill's own .apm/skills/ path", () => {
    // basename() alone would accept this.
    const elsewhere: LockfileEntry = {
      ...tddEntry,
      virtual_path: "vendor/other/tdd",
    };
    expect(refForDeployedSkill([elsewhere], "tdd")).toEqual({
      ok: false,
      reason: "ref-unresolvable",
    });
  });

  it("refuses an entry written against the retired root skills/ path", () => {
    const retired: LockfileEntry = { ...tddEntry, virtual_path: "skills/tdd" };
    expect(refForDeployedSkill([retired], "tdd")).toEqual({
      ok: false,
      reason: "ref-unresolvable",
    });
  });

  it("refuses an entry hosted anywhere but GitHub", () => {
    const elsewhere: LockfileEntry = { ...tddEntry, host: "evil.example.com" };
    expect(refForDeployedSkill([elsewhere], "tdd")).toEqual({
      ok: false,
      reason: "ref-unresolvable",
    });
  });

  it("refuses an entry whose repo is not a plain owner/repo", () => {
    const odd: LockfileEntry = { ...tddEntry, repo_url: "../../etc/passwd" };
    expect(refForDeployedSkill([odd], "tdd")).toEqual({
      ok: false,
      reason: "ref-unresolvable",
    });
  });

  it("refuses an entry that is not pinned to a version tag", () => {
    const unpinned: LockfileEntry = { ...tddEntry, resolved_ref: "main" };
    expect(refForDeployedSkill([unpinned], "tdd")).toEqual({
      ok: false,
      reason: "ref-unresolvable",
    });
  });

  it("refuses when two entries both claim the same skill", () => {
    const duplicate: LockfileEntry = {
      ...tddEntry,
      repo_url: "someone-else/harness",
    };
    expect(refForDeployedSkill([tddEntry, duplicate], "tdd")).toEqual({
      ok: false,
      reason: "ref-unresolvable",
    });
  });
});
