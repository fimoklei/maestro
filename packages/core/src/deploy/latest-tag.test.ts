import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveLatestTagFromVersionsTable } from "./latest-tag";

function fixture(name: string): string {
  return readFileSync(
    join(import.meta.dirname, "../../../../tests/fixtures", name),
    "utf8",
  );
}

describe("resolveLatestTagFromVersionsTable", () => {
  it("returns the latest semver tag from captured apm output", () => {
    expect(
      resolveLatestTagFromVersionsTable(fixture("apm-view-versions.txt")),
    ).toBe("v0.6.0");
  });

  it("ignores branch rows even when they appear last", () => {
    const table = [
      "| v1.0.0 | tag    | aaaaaaaa |",
      "| main   | branch | bbbbbbbb |",
    ].join("\n");
    expect(resolveLatestTagFromVersionsTable(table)).toBe("v1.0.0");
  });

  it("semver-sorts instead of trusting row order or lexicographic order", () => {
    const table = [
      "| v0.9.0  | tag | aaaaaaaa |",
      "| v0.10.0 | tag | bbbbbbbb |",
      "| v0.2.0  | tag | cccccccc |",
    ].join("\n");
    expect(resolveLatestTagFromVersionsTable(table)).toBe("v0.10.0");
  });

  it("ignores tag rows that are not of shape vX.Y.Z", () => {
    const table = [
      "| v0.5.0      | tag | aaaaaaaa |",
      "| release-1   | tag | bbbbbbbb |",
      "| v1.2        | tag | cccccccc |",
    ].join("\n");
    expect(resolveLatestTagFromVersionsTable(table)).toBe("v0.5.0");
  });

  it("returns null when no deployable tag exists", () => {
    const table = "| main | branch | 41ecfe81 |";
    expect(resolveLatestTagFromVersionsTable(table)).toBeNull();
  });
});
