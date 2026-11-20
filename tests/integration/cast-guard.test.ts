import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findOffenders } from "../../scripts/cast-guard.mjs";

const guard = resolve(import.meta.dirname, "../../scripts/cast-guard.mjs");

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "maestro-cast-guard-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function plant(path: string, content: string): void {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

describe("cast guard", () => {
  it("fails a cast with no reason and names its file and line", () => {
    plant(
      "packages/web/src/a.tsx",
      "const x: unknown = 1;\nexport const a = x as number;\n",
    );

    expect(findOffenders(root)).toEqual([
      "packages/web/src/a.tsx:2: as number",
    ]);
  });

  it.each([
    ["on its line", "export const a = x as number; // Set to 1 above.\n"],
    [
      "on the line above",
      "// Set to 1 above.\nexport const a = x as number;\n",
    ],
    [
      "above the statement it sits in",
      "// Set to 1 above.\nexport const a = {\n  b: x as number,\n};\n",
    ],
    [
      "inside the statement, above the cast",
      "export const a = {\n  // Set to 1 above.\n  b: x as number,\n};\n",
    ],
    [
      "after the parameters, above the body",
      "export const a = (\n  y: unknown,\n  // Set to 1 above.\n): number => y as number;\n",
    ],
  ])("passes a cast with a reason %s", (_, body) => {
    plant("packages/core/src/a.ts", `const x: unknown = 1;\n${body}`);

    expect(findOffenders(root)).toEqual([]);
  });

  it("passes `as const` and the `as` of an import or export", () => {
    plant(
      "packages/core/src/a.ts",
      'import * as path from "node:path";\nexport { path as p };\nexport const a = [1] as const;\n',
    );

    expect(findOffenders(root)).toEqual([]);
  });

  it("reports a double cast once", () => {
    plant(
      "packages/core/src/a.ts",
      "const x = 1;\nexport const a = x as unknown as string;\n",
    );

    expect(findOffenders(root)).toEqual([
      "packages/core/src/a.ts:2: as unknown as string",
    ]);
  });

  it("ignores test code and files outside packages", () => {
    const cast = "const x: unknown = 1;\nexport const a = x as number;\n";
    plant("packages/web/src/a.test.tsx", cast);
    plant("packages/web/src/a.stories.tsx", cast);
    plant("packages/web/src/test-utils.tsx", cast);
    plant("packages/web/src/registry/a-test-helpers.tsx", cast);
    plant("packages/web/.storybook/preview.tsx", cast);
    plant("packages/core/src/a.fake.ts", cast);
    plant("tests/integration/a.test.ts", cast);
    plant("packages/core/node_modules/b/index.ts", cast);

    expect(findOffenders(root)).toEqual([]);
  });

  it("runs as a command: silent exit 0 on a clean tree, exit 1 and one line per offender", () => {
    const run = () =>
      spawnSync(process.execPath, [guard, root], { encoding: "utf8" });

    expect(run()).toMatchObject({ status: 0, stdout: "" });

    plant(
      "packages/server/src/e.ts",
      "const x: unknown = 1;\nexport const e = x as number;\n",
    );

    expect(run()).toMatchObject({
      status: 1,
      stdout: "packages/server/src/e.ts:2: as number\n",
      stderr:
        "cast-guard: 1 casts without a reason. Give every `as` cast in product code a comment that says why it holds, on its line or above it.\n",
    });
  });
});
