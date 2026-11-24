import { describe, expect, it } from "vitest";
import { hasErrnoCode } from "./errno";

describe("hasErrnoCode", () => {
  it("matches an error that carries the code", () => {
    const error = Object.assign(new Error("no such file"), { code: "ENOENT" });

    expect(hasErrnoCode(error, "ENOENT")).toBe(true);
  });

  it("refuses an error that carries a different code", () => {
    const error = Object.assign(new Error("file exists"), { code: "EEXIST" });

    expect(hasErrnoCode(error, "ENOENT")).toBe(false);
  });

  it.each([
    ["a plain object with the code", { code: "ENOENT" }, true],
    ["an error without a code", new Error("boom"), false],
    ["a string", "ENOENT", false],
    ["null", null, false],
  ])("reads %s", (_, value, expected) => {
    expect(hasErrnoCode(value, "ENOENT")).toBe(expected);
  });
});
