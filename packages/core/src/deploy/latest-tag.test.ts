import { describe, expect, it } from "vitest";
import { resolveLatestTagFromVersionsTable } from "./latest-tag";

// Captured output of `apm view fimoklei/agent-harness versions` (apm 0.26.0,
// 2026-07-20). The full file lives in tests/fixtures/apm-view-versions.txt;
// inlined here so the pure lane stays free of file I/O.
const capturedTable = `     Available versions:
    fimoklei/agent-harness
┏━━━━━━━━┳━━━━━━━━┳━━━━━━━━━━┓
┃ Name   ┃ Type   ┃ Commit   ┃
┡━━━━━━━━╇━━━━━━━━╇━━━━━━━━━━┩
│ v0.5.1 │ tag    │ 471c4b26 │
│ v0.5.0 │ tag    │ ec491f15 │
│ v0.4.1 │ tag    │ 10ff6a4f │
│ v0.4.0 │ tag    │ 9662b03d │
│ v0.3.0 │ tag    │ 3097ba05 │
│ v0.2.1 │ tag    │ 7f2fdd41 │
│ v0.2.0 │ tag    │ e1a5dabd │
│ v0.1.0 │ tag    │ a08a0daf │
│ main   │ branch │ 3a82d265 │
└────────┴────────┴──────────┘
`;

describe("resolveLatestTagFromVersionsTable", () => {
  it("returns the latest semver tag from captured apm output", () => {
    expect(resolveLatestTagFromVersionsTable(capturedTable)).toBe("v0.5.1");
  });

  it("ignores branch rows even when they appear last", () => {
    const table = [
      "│ v1.0.0 │ tag    │ aaaaaaaa │",
      "│ main   │ branch │ bbbbbbbb │",
    ].join("\n");
    expect(resolveLatestTagFromVersionsTable(table)).toBe("v1.0.0");
  });

  it("semver-sorts instead of trusting row order or lexicographic order", () => {
    const table = [
      "│ v0.9.0  │ tag │ aaaaaaaa │",
      "│ v0.10.0 │ tag │ bbbbbbbb │",
      "│ v0.2.0  │ tag │ cccccccc │",
    ].join("\n");
    expect(resolveLatestTagFromVersionsTable(table)).toBe("v0.10.0");
  });

  it("ignores tag rows that are not of shape vX.Y.Z", () => {
    const table = [
      "│ v0.5.0      │ tag │ aaaaaaaa │",
      "│ release-1   │ tag │ bbbbbbbb │",
      "│ v1.2        │ tag │ cccccccc │",
    ].join("\n");
    expect(resolveLatestTagFromVersionsTable(table)).toBe("v0.5.0");
  });

  it("returns null when no deployable tag exists", () => {
    const table = "│ main │ branch │ 41ecfe81 │";
    expect(resolveLatestTagFromVersionsTable(table)).toBeNull();
  });
});
