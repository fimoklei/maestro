import { describe, expect, it } from "vitest";
import { normalizeRepoPathInput } from "./repo-path";

// Pure normalization: trim + reject empty/relative. No filesystem here — the
// I/O checks (exists, is-a-directory) live in validateRepoPath.
describe("normalizeRepoPathInput", () => {
  it("trims surrounding whitespace and keeps an absolute path", () => {
    expect(normalizeRepoPathInput("  /Users/me/project  ")).toEqual({
      ok: true,
      path: "/Users/me/project",
    });
  });

  it("rejects an empty or whitespace-only path as missing", () => {
    expect(normalizeRepoPathInput("   ")).toEqual({
      ok: false,
      error: "missing",
    });
  });

  it("rejects a relative path", () => {
    expect(normalizeRepoPathInput("./project")).toEqual({
      ok: false,
      error: "relative",
    });
  });
});
