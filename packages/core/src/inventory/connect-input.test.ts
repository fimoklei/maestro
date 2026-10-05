import { describe, expect, it } from "vitest";
import { classifyConnectInput } from "./connect-input";

describe("classifyConnectInput", () => {
  it("routes an https GitHub url to the clone route, named by its repository", () => {
    expect(
      classifyConnectInput("https://github.com/fimoklei/agent-harness.git"),
    ).toEqual({
      ok: true,
      kind: "url",
      url: "https://github.com/fimoklei/agent-harness.git",
      repoName: "agent-harness",
      ownerRepo: "fimoklei/agent-harness",
    });
  });

  it("routes the scp-like ssh form to the clone route", () => {
    expect(
      classifyConnectInput("git@github.com:fimoklei/agent-harness.git"),
    ).toEqual({
      ok: true,
      kind: "url",
      url: "git@github.com:fimoklei/agent-harness.git",
      repoName: "agent-harness",
      ownerRepo: "fimoklei/agent-harness",
    });
  });

  it("trims the pasted url before reading it", () => {
    expect(classifyConnectInput("  https://github.com/o/r  ")).toEqual({
      ok: true,
      kind: "url",
      url: "https://github.com/o/r",
      repoName: "r",
      ownerRepo: "o/r",
    });
  });

  it("routes an absolute local path to the existing path route", () => {
    expect(classifyConnectInput("/Users/me/agent-harness")).toEqual({
      ok: true,
      kind: "path",
    });
  });

  it("routes a path containing an @ to the path route, not the clone route", () => {
    expect(classifyConnectInput("/Users/me@work/agent-harness")).toEqual({
      ok: true,
      kind: "path",
    });
  });

  it("refuses a remote url that is not GitHub, before any network call", () => {
    expect(classifyConnectInput("https://gitlab.com/o/r.git")).toEqual({
      ok: false,
      error: "not-a-github-url",
    });
  });

  it("refuses a non-GitHub scp-like remote", () => {
    expect(classifyConnectInput("git@gitlab.com:o/r.git")).toEqual({
      ok: false,
      error: "not-a-github-url",
    });
  });

  it("refuses a transport apm's ref could never carry", () => {
    expect(classifyConnectInput("git://github.com/o/r.git")).toEqual({
      ok: false,
      error: "not-a-github-url",
    });
  });

  it("refuses a GitHub url that names no repository", () => {
    expect(classifyConnectInput("https://github.com/fimoklei")).toEqual({
      ok: false,
      error: "not-a-github-url",
    });
  });

  // git stores the clone url on disk, so a pasted token would be stored too.
  it("refuses a url carrying credentials rather than cloning with them", () => {
    expect(
      classifyConnectInput("https://user:token@github.com/fimoklei/harness"),
    ).toEqual({ ok: false, error: "url-carries-credentials" });
  });

  it("refuses a url carrying a bare username", () => {
    expect(classifyConnectInput("https://token@github.com/o/r")).toEqual({
      ok: false,
      error: "url-carries-credentials",
    });
  });

  it("keeps accepting the ssh user in the scp-like form", () => {
    expect(classifyConnectInput("git@github.com:o/r.git")).toEqual({
      ok: true,
      kind: "url",
      url: "git@github.com:o/r.git",
      repoName: "r",
      ownerRepo: "o/r",
    });
  });

  it("refuses a repository name that would escape the destination parent", () => {
    expect(classifyConnectInput("https://github.com/owner/..")).toEqual({
      ok: false,
      error: "not-a-github-url",
    });
  });

  it("classifies a long run of repeated '!@' in linear time", () => {
    const started = performance.now();
    const route = classifyConnectInput("!@".repeat(20_000));
    expect(performance.now() - started).toBeLessThan(200);
    expect(route).toEqual({ ok: true, kind: "path" });
  });
});
