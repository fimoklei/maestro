import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveApmGlobalRoot } from "./resolve-apm-global-root";

// HOME-redirectable, so tests never touch the real ~/.apm.
describe("resolveApmGlobalRoot", () => {
  it("resolves the apm user-scope directory under the home directory", () => {
    expect(resolveApmGlobalRoot({ HOME: "/sandbox/home" })).toBe(
      join("/sandbox/home", ".apm"),
    );
  });

  it("falls back to the OS home directory when HOME is unset", () => {
    expect(resolveApmGlobalRoot({})).toBe(join(homedir(), ".apm"));
  });
});
