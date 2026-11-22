import { readdirSync, readFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";
import { resolveMaestroConfigPath } from "@maestro/core";
import { describe, expect, it } from "vitest";

const operatorHome = userInfo().homedir;
const REPO = join(import.meta.dirname, "../..");
const ENV_WRITE = /process\.env(\.\w+|\[[^\]]+\])\s*=(?!=)|delete process\.env/;

const ROOTS = [
  "tests",
  ...readdirSync(join(REPO, "packages")).map((name) =>
    join("packages", name, "src"),
  ),
];

function testFiles(): string[] {
  return ROOTS.flatMap((root) =>
    readdirSync(join(REPO, root), { recursive: true, encoding: "utf8" })
      .filter((path) => /\.test\.tsx?$/.test(path))
      .map((path) => join(root, path)),
  );
}

// A test that outlives its own env restore must not reach the operator's
// config (#1935).
describe("test isolation", () => {
  it("keeps HOME outside the operator's home", () => {
    expect(homedir().startsWith(operatorHome)).toBe(false);
  });

  it("keeps the Maestro config outside the operator's home", () => {
    expect(resolveMaestroConfigPath(process.env).startsWith(operatorHome)).toBe(
      false,
    );
  });

  // Assigning a saved `undefined` back stores the string "undefined" (#1935).
  it("changes env only through vi.stubEnv", () => {
    const writers = testFiles().filter((path) =>
      ENV_WRITE.test(readFileSync(join(REPO, path), "utf8")),
    );
    expect(writers).toEqual([]);
  });
});
