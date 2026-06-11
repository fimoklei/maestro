import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveApmGlobalRoot } from "./resolve-apm-global-root";

// apm installs user-scope state under ~/.apm (its metadata root derives from the
// user's home, per the global-scope spike in .claude/rules/apm-driver.md). The
// resolver locates that directory so the server can read the global lockfile
// server-side, and is HOME-redirectable so tests never touch the real ~/.apm.
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
