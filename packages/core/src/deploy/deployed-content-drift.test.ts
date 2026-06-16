import { describe, expect, it } from "vitest";
import { classifyDeployedDrift } from "./deployed-content-drift";

describe("classifyDeployedDrift", () => {
  it("is clean when every live file matches its lock hash exactly", () => {
    const hashes = { "SKILL.md": "sha256:aaa", "tests.md": "sha256:bbb" };
    expect(classifyDeployedDrift(hashes, { ...hashes })).toBe("clean");
  });

  it("diverges when a deployed file's content was edited (hash differs)", () => {
    const lock = { "SKILL.md": "sha256:aaa" };
    const live = { "SKILL.md": "sha256:edited" };
    expect(classifyDeployedDrift(lock, live)).toBe("diverged");
  });

  it("diverges when a lock-recorded file is missing from the deployed copy", () => {
    const lock = { "SKILL.md": "sha256:aaa", "tests.md": "sha256:bbb" };
    const live = { "SKILL.md": "sha256:aaa" };
    expect(classifyDeployedDrift(lock, live)).toBe("diverged");
  });

  it("diverges on an untracked file the lockfile does not record", () => {
    const lock = { "SKILL.md": "sha256:aaa" };
    const live = { "SKILL.md": "sha256:aaa", "STRAY.md": "sha256:ccc" };
    expect(classifyDeployedDrift(lock, live)).toBe("diverged");
  });
});
