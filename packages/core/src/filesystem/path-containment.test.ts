import { describe, expect, it } from "vitest";
import { isWithinRoot } from "./path-containment";

// The security predicate behind every home-ceiling check: both inputs are
// realpath output, so traversal and symlink escapes are already a plain prefix
// question here.
describe("isWithinRoot", () => {
  it("accepts the root itself", () => {
    expect(isWithinRoot("/home/user", "/home/user")).toBe(true);
  });

  it("accepts a nested child", () => {
    expect(isWithinRoot("/home/user/dev/repo", "/home/user")).toBe(true);
  });

  it("rejects a path above the root", () => {
    expect(isWithinRoot("/home", "/home/user")).toBe(false);
  });

  it("rejects a sibling that shares the root's name prefix", () => {
    expect(isWithinRoot("/home/user-evil", "/home/user")).toBe(false);
  });

  it("rejects an unrelated path", () => {
    expect(isWithinRoot("/etc/passwd", "/home/user")).toBe(false);
  });
});
