import { describe, expect, it } from "vitest";
import { parseGitOrigin } from "./git-origin";

describe("parseGitOrigin", () => {
  it("parses an SSH origin url", () => {
    expect(parseGitOrigin("git@github.com:fimoklei/agent-harness.git")).toEqual(
      {
        host: "github.com",
        ownerRepo: "fimoklei/agent-harness",
      },
    );
  });

  it("parses an HTTPS origin url, with or without .git", () => {
    expect(
      parseGitOrigin("https://github.com/fimoklei/agent-harness.git"),
    ).toEqual({
      host: "github.com",
      ownerRepo: "fimoklei/agent-harness",
    });
    expect(parseGitOrigin("https://github.com/fimoklei/agent-harness")).toEqual(
      {
        host: "github.com",
        ownerRepo: "fimoklei/agent-harness",
      },
    );
  });

  it("returns null for urls it cannot derive owner/repo from", () => {
    expect(parseGitOrigin("")).toBeNull();
    expect(parseGitOrigin("/local/path/to/clone")).toBeNull();
    expect(parseGitOrigin("https://github.com/only-owner")).toBeNull();
  });
});
