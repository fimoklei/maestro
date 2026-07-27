import { describe, expect, it } from "vitest";
import type { LockfileEntry } from "../lockfile/lockfile";
import { refForDeployedSkill } from "./deployed-ref";

const tddEntry: LockfileEntry = {
  host: "github.com",
  repo_url: "fimoklei/agent-harness",
  resolved_ref: "v0.5.1",
  virtual_path: "skills/tdd",
  package_type: "claude_skill",
};

describe("refForDeployedSkill", () => {
  it("rebuilds the tag-pinned ref the install used", () => {
    expect(refForDeployedSkill([tddEntry], "tdd")).toEqual({
      ok: true,
      ref: "github.com/fimoklei/agent-harness/skills/tdd#v0.5.1",
    });
  });

  it("picks the entry whose name matches, not the first one", () => {
    const jobsEntry: LockfileEntry = {
      ...tddEntry,
      resolved_ref: "v0.4.0",
      virtual_path: "skills/jobs",
    };
    expect(refForDeployedSkill([jobsEntry, tddEntry], "tdd")).toEqual({
      ok: true,
      ref: "github.com/fimoklei/agent-harness/skills/tdd#v0.5.1",
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
      virtual_path: "hooks/tdd",
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
});
