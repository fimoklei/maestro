import { describe, expect, it } from "vitest";
import { githubPageFromOriginUrl } from "./github-page";

describe("githubPageFromOriginUrl", () => {
  it("links a github.com origin in either transport to its repository page", () => {
    const page = {
      kind: "link",
      url: "https://github.com/fimoklei/agent-harness",
    };
    expect(
      githubPageFromOriginUrl("git@github.com:fimoklei/agent-harness.git"),
    ).toEqual(page);
    expect(
      githubPageFromOriginUrl("https://github.com/fimoklei/agent-harness.git"),
    ).toEqual(page);
  });

  it("drops the credentials of a credentialed remote", () => {
    expect(
      githubPageFromOriginUrl("https://ghp_token@github.com/o/r.git"),
    ).toEqual({ kind: "link", url: "https://github.com/o/r" });
  });

  it("has no page for another host, a local path or no origin", () => {
    expect(githubPageFromOriginUrl("https://gitlab.com/o/r")).toBeNull();
    expect(githubPageFromOriginUrl("/local/clone")).toBeNull();
    expect(githubPageFromOriginUrl(null)).toBeNull();
  });

  it("has no page for an owner or repository name GitHub would refuse", () => {
    expect(githubPageFromOriginUrl("git@github.com:o/r?tab=x")).toBeNull();
    expect(githubPageFromOriginUrl("git@github.com:o_o/r")).toBeNull();
    expect(githubPageFromOriginUrl("git@github.com:o/r#x")).toBeNull();
  });
});
