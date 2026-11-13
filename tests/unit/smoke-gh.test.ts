import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ghWriteRefusal } from "../../scripts/smoke-gh.mjs";

const SCRIPT = join(import.meta.dirname, "../../scripts/smoke-gh.mjs");

describe("ghWriteRefusal", () => {
  it.each([
    ["pr", "create", "--head", "maestro/propose/tdd"],
    ["pr", "edit", "12", "--body", "x"],
    ["pr", "close", "12"],
    ["pr", "reopen", "12"],
    ["pr", "merge", "12"],
  ])("refuses gh %s %s", (...args) => {
    expect(ghWriteRefusal(args)).toBe(
      `[smoke] gh ${args[0]} ${args[1]} stops in the sandbox, so GitHub sees no write.`,
    );
  });

  it.each([
    ["pr", "list", "--json", "number"],
    ["api", "--hostname", "github.com", "user", "--jq", "{login}"],
    ["auth", "token"],
  ])("lets gh %s %s through", (...args) => {
    expect(ghWriteRefusal(args)).toBeNull();
  });
});

describe("smoke-gh command", () => {
  const run = (args: string[]) =>
    spawnSync(process.execPath, [SCRIPT, ...args], {
      encoding: "utf8",
      env: { ...process.env, MAESTRO_SMOKE_REAL_GH: "/usr/bin/true" },
    });

  it("exits 1 on a write and names it", () => {
    const result = run(["pr", "create", "--title", "x"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("gh pr create stops in the sandbox");
  });

  it("hands a read to the real gh and keeps its exit code", () => {
    expect(run(["pr", "list"]).status).toBe(0);
  });
});
