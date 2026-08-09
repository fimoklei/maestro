import { describe, expect, it } from "vitest";
import { classifyCloneFailure } from "./classify-clone-failure";

describe("classifyCloneFailure", () => {
  it("names a https clone with no credentials as an authentication failure", () => {
    expect(
      classifyCloneFailure(
        "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
      ),
    ).toBe("clone-auth-failed");
  });

  it("names a rejected https credential as an authentication failure", () => {
    expect(
      classifyCloneFailure(
        "remote: Support for password authentication was removed.\nfatal: Authentication failed for 'https://github.com/o/r.git/'",
      ),
    ).toBe("clone-auth-failed");
  });

  it("names an ssh clone with no usable key as an authentication failure", () => {
    expect(
      classifyCloneFailure(
        "git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.",
      ),
    ).toBe("clone-auth-failed");
  });

  // GitHub answers a private repository the same way it answers a missing one,
  // so the two cannot be told apart and must not be guessed at.
  it("names a repository GitHub will not admit to as unavailable", () => {
    expect(
      classifyCloneFailure(
        "remote: Repository not found.\nfatal: repository 'https://github.com/o/r.git/' not found",
      ),
    ).toBe("clone-unavailable");
  });

  it("names an unreachable remote as unavailable", () => {
    expect(
      classifyCloneFailure(
        "fatal: unable to access ...: Could not resolve host",
      ),
    ).toBe("clone-unavailable");
  });

  it("names an empty failure as unavailable, never as an auth problem", () => {
    expect(classifyCloneFailure("")).toBe("clone-unavailable");
  });

  // Git wraps and cases its own text freely; a phrase split across a line
  // break must still match (LEARNINGS · rich-wraps-phrases-mid-sentence).
  it("matches a phrase broken across lines and casing", () => {
    expect(
      classifyCloneFailure("fatal: AUTHENTICATION\n   FAILED for 'https://…'"),
    ).toBe("clone-auth-failed");
  });
});
