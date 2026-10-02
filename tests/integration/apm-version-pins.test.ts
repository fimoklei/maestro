import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkPrerequisites } from "../../scripts/bootstrap.mjs";

const repoRoot = join(import.meta.dirname, "../..");

function versionIn(file: string, pattern: RegExp): string | undefined {
  return pattern.exec(readFileSync(join(repoRoot, file), "utf8"))?.[1];
}

// One apm upgrade moves every pin together: a pin left behind tells the next
// reader (or bootstrap's warning) the wrong measured version.
describe("measured apm version", () => {
  const measured = versionIn(
    "docs/apm-behavior.md",
    /version: (\d+\.\d+\.\d+), verified/,
  );

  it("is stated in the behavior doc header", () => {
    expect(measured).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("matches the fixture provenance header", () => {
    expect(
      versionIn(
        "tests/fixtures/README.md",
        /reflect `apm` \*\*(\d+\.\d+\.\d+)\*\*/,
      ),
    ).toBe(measured);
  });

  it("is the version bootstrap accepts without a warning", () => {
    const result = checkPrerequisites({
      nodeVersion: "v24.1.0",
      requiredMajor: 24,
      platform: "darwin",
      run: (cmd) =>
        cmd === "apm"
          ? `Agent Package Manager (APM) CLI version ${measured}\n`
          : "11.24.0\n",
    });

    expect(result.apmWarning).toBeNull();
  });
});
