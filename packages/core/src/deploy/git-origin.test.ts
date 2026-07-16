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

  it("parses an ssh:// origin url, with or without userinfo", () => {
    expect(
      parseGitOrigin("ssh://git@github.com/fimoklei/agent-harness.git"),
    ).toEqual({ host: "github.com", ownerRepo: "fimoklei/agent-harness" });
    expect(parseGitOrigin("ssh://github.com/fimoklei/agent-harness")).toEqual({
      host: "github.com",
      ownerRepo: "fimoklei/agent-harness",
    });
  });

  it("strips embedded credentials from an HTTPS host so no token leaks", () => {
    // A credentialed remote must never put its token into the host (and thus
    // into the apm package ref / argv). Only the real hostname survives.
    expect(
      parseGitOrigin(
        "https://x-access-token:ghs_secret@github.com/fimoklei/agent-harness.git",
      ),
    ).toEqual({ host: "github.com", ownerRepo: "fimoklei/agent-harness" });
    expect(
      parseGitOrigin("https://ghp_token@github.com/fimoklei/agent-harness.git"),
    ).toEqual({ host: "github.com", ownerRepo: "fimoklei/agent-harness" });
  });

  it("returns null for urls it cannot derive owner/repo from", () => {
    expect(parseGitOrigin("")).toBeNull();
    expect(parseGitOrigin("/local/path/to/clone")).toBeNull();
    expect(parseGitOrigin("https://github.com/only-owner")).toBeNull();
  });

  it("returns null for remote schemes apm cannot resolve", () => {
    // These parse cleanly (file://server/owner/repo even carries a hostname)
    // but can never become a resolvable apm package ref: file remotes are
    // unreachable for apm and git:// daemon refs are unsupported by apm 0.20.
    expect(parseGitOrigin("file:///tmp/agent-harness")).toBeNull();
    expect(parseGitOrigin("file://server/owner/repo")).toBeNull();
    expect(parseGitOrigin("git://git.example/acme/inventory.git")).toBeNull();
  });
});
