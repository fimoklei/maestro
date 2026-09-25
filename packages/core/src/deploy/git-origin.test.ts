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
    // A token in the host would reach the apm package ref and argv.
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

  it("returns null for an origin on a non-default port", () => {
    // A skill ref cannot carry a port, and dropping it would send apm to the
    // default port (#152).
    expect(parseGitOrigin("ssh://git.example:2222/acme/inventory")).toBeNull();
    expect(
      parseGitOrigin("https://git.example:8443/acme/inventory.git"),
    ).toBeNull();
  });

  it("returns null for a GitHub origin on a non-default port", () => {
    // Other hosts are already refused for the host alone, so only this one proves
    // the port branch (#152).
    expect(
      parseGitOrigin("https://github.com:8443/fimoklei/agent-harness.git"),
    ).toBeNull();
    expect(
      parseGitOrigin("ssh://git@github.com:2222/fimoklei/agent-harness"),
    ).toBeNull();
  });

  it("parses an origin that spells out its scheme's default port", () => {
    // `URL` normalises the port away for https but not for ssh.
    expect(
      parseGitOrigin("ssh://git@github.com:22/fimoklei/agent-harness.git"),
    ).toEqual({ host: "github.com", ownerRepo: "fimoklei/agent-harness" });
    expect(
      parseGitOrigin("https://github.com:443/fimoklei/agent-harness"),
    ).toEqual({ host: "github.com", ownerRepo: "fimoklei/agent-harness" });
  });

  it("returns null for a host outside the GitHub model deploys resolve against", () => {
    // On other hosts apm silently folds the `skills/<name>` subpath into the repo
    // name, so a non-GitHub origin could only fail at deploy.
    expect(parseGitOrigin("https://gitlab.com/acme/inventory")).toBeNull();
    expect(parseGitOrigin("ssh://git.example/acme/inventory")).toBeNull();
    expect(parseGitOrigin("git@bitbucket.org:acme/inventory.git")).toBeNull();
  });

  it("accepts a host however it is cased, and reports it lowercased", () => {
    // `URL` lowercases the host only for schemes it knows, so ssh and scp-like
    // remotes need normalising.
    expect(parseGitOrigin("ssh://git@GitHub.com/acme/inventory.git")).toEqual({
      host: "github.com",
      ownerRepo: "acme/inventory",
    });
    expect(parseGitOrigin("git@GitHub.com:acme/inventory.git")).toEqual({
      host: "github.com",
      ownerRepo: "acme/inventory",
    });
  });

  it("returns null for remote schemes apm cannot resolve", () => {
    // These parse but can never become a resolvable apm package ref (#152).
    expect(parseGitOrigin("file:///tmp/agent-harness")).toBeNull();
    expect(parseGitOrigin("file://server/owner/repo")).toBeNull();
    expect(parseGitOrigin("git://git.example/acme/inventory.git")).toBeNull();
    expect(parseGitOrigin("http://git.example/acme/inventory")).toBeNull();
  });
});
