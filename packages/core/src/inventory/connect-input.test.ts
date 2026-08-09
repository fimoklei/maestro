import { describe, expect, it } from "vitest";
import { classifyConnectInput, cloneDestination } from "./connect-input";

describe("classifyConnectInput", () => {
  it("routes an https GitHub url to the clone route, named by its repository", () => {
    expect(
      classifyConnectInput("https://github.com/fimoklei/agent-harness.git"),
    ).toEqual({
      ok: true,
      kind: "url",
      url: "https://github.com/fimoklei/agent-harness.git",
      repoName: "agent-harness",
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
    });
  });

  it("trims the pasted url before reading it", () => {
    expect(classifyConnectInput("  https://github.com/o/r  ")).toEqual({
      ok: true,
      kind: "url",
      url: "https://github.com/o/r",
      repoName: "r",
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

  it("refuses a repository name that would escape the destination parent", () => {
    expect(classifyConnectInput("https://github.com/owner/..")).toEqual({
      ok: false,
      error: "not-a-github-url",
    });
  });
});

describe("cloneDestination", () => {
  it("proposes a new folder named after the repository under the home ceiling", () => {
    expect(cloneDestination("/Users/me", "agent-harness")).toBe(
      "/Users/me/agent-harness",
    );
  });

  it("keeps the repository's own spelling, dots and case included", () => {
    expect(cloneDestination("/Users/me", "Agent.Harness")).toBe(
      "/Users/me/Agent.Harness",
    );
  });

  it("joins a ceiling with a trailing separator without doubling it", () => {
    expect(cloneDestination("/Users/me/", "agent-harness")).toBe(
      "/Users/me/agent-harness",
    );
  });
});
