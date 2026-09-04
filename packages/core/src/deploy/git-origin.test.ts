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

  it("returns null for an origin on a non-default port", () => {
    // A port cannot reach apm through a skill ref (issue #152; the observed
    // grammar is in `.claude/rules/apm-driver.md`), and dropping it silently
    // would send apm to the default port and fail at the first deploy.
    expect(parseGitOrigin("ssh://git.example:2222/acme/inventory")).toBeNull();
    expect(
      parseGitOrigin("https://git.example:8443/acme/inventory.git"),
    ).toBeNull();
  });

  it("returns null for a GitHub origin on a non-default port", () => {
    // The port rejection has to bite on the one host deploys resolve against:
    // on any other host the origin is already refused for the host alone, so
    // the branch would go unproven (#152, ADR-0014).
    expect(
      parseGitOrigin("https://github.com:8443/fimoklei/agent-harness.git"),
    ).toBeNull();
    expect(
      parseGitOrigin("ssh://git@github.com:2222/fimoklei/agent-harness"),
    ).toBeNull();
  });

  it("parses an origin that spells out its scheme's default port", () => {
    // Such a remote reaches the same host apm's default transport would, so
    // it is representable. `URL` normalises the port away for https but not
    // for ssh, which it does not know — hence the explicit `:22` case.
    expect(
      parseGitOrigin("ssh://git@github.com:22/fimoklei/agent-harness.git"),
    ).toEqual({ host: "github.com", ownerRepo: "fimoklei/agent-harness" });
    expect(
      parseGitOrigin("https://github.com:443/fimoklei/agent-harness"),
    ).toEqual({ host: "github.com", ownerRepo: "fimoklei/agent-harness" });
  });

  it("returns null for a host outside the GitHub model deploys resolve against", () => {
    // apm reads `skills/<name>` as a virtual package only for the host shapes
    // it knows; on any other host the subpath silently becomes part of the
    // repo name (`gitlab.com/o/r/skills/tdd` -> repo `o/r/skills/tdd`, no
    // virtual_path). Tag resolution is GitHub-only besides (ADR-0003), so a
    // non-GitHub origin can only fail at deploy — refuse it at connect.
    expect(parseGitOrigin("https://gitlab.com/acme/inventory")).toBeNull();
    expect(parseGitOrigin("ssh://git.example/acme/inventory")).toBeNull();
    expect(parseGitOrigin("git@bitbucket.org:acme/inventory.git")).toBeNull();
  });

  it("accepts a host however it is cased, and reports it lowercased", () => {
    // DNS is case-insensitive, but `URL` lowercases the host only for the
    // schemes it knows — ssh:// and the scp-like form keep whatever the remote
    // was written as. Without normalising, a valid GitHub remote would be
    // refused on spelling alone.
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
    // These parse cleanly (file://server/owner/repo even carries a hostname)
    // but can never become a resolvable apm package ref: file remotes are
    // unreachable for apm, git:// daemon refs are unsupported by apm 0.20, and
    // an http:-only remote can state its plaintext transport only in the ref
    // form that refuses a skill's subpath (issue #152; see apm-driver.md).
    expect(parseGitOrigin("file:///tmp/agent-harness")).toBeNull();
    expect(parseGitOrigin("file://server/owner/repo")).toBeNull();
    expect(parseGitOrigin("git://git.example/acme/inventory.git")).toBeNull();
    expect(parseGitOrigin("http://git.example/acme/inventory")).toBeNull();
  });
});
