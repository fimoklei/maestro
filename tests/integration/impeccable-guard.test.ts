import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findOffenders } from "../../scripts/impeccable-guard.mjs";

const repo = resolve(import.meta.dirname, "../..");
const guard = join(repo, "scripts/impeccable-guard.mjs");
// Installed per worktree, never committed: CI has none.
const launcher = join(repo, ".claude/skills/impeccable/scripts/impeccable");
const installed = existsSync(launcher);

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "maestro-impeccable-guard-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function plant(path: string, content: string): void {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

const GRAY_ON_COLOR =
  'export const A = () => <p className="text-gray-500 bg-blue-500">a</p>;\n';

describe("impeccable guard", () => {
  it("skips the scan where impeccable is not installed", () => {
    plant("packages/web/src/a.tsx", GRAY_ON_COLOR);

    expect(findOffenders(root, join(root, "missing/impeccable"))).toBeNull();
  });

  it.skipIf(!installed)("passes a tree with no anti-pattern", () => {
    plant(
      "packages/web/src/a.tsx",
      'export const A = () => <p className="text-gray-12">a</p>;\n',
    );

    expect(findOffenders(root, launcher)).toEqual([]);
  });

  it.skipIf(!installed)(
    "names the file, line and rule of an anti-pattern",
    () => {
      plant("packages/web/src/a.tsx", `\n${GRAY_ON_COLOR}`);

      expect(findOffenders(root, launcher)).toEqual([
        expect.stringMatching(
          /^packages\/web\/src\/a\.tsx:2: \[gray-on-color\]/,
        ),
      ]);
    },
  );

  it.skipIf(!installed)("honours the shared ignores in .impeccable", () => {
    plant("packages/web/src/a.tsx", GRAY_ON_COLOR);
    plant(
      ".impeccable/config.json",
      JSON.stringify({ detector: { ignoreFiles: ["packages/web/src/a.tsx"] } }),
    );

    expect(findOffenders(root, launcher)).toEqual([]);
  });

  it.skipIf(!installed)("exits non-zero and prints each finding", () => {
    plant("packages/web/src/a.tsx", GRAY_ON_COLOR);

    const run = spawnSync("node", [guard, root, launcher], {
      encoding: "utf8",
    });

    expect(run.status).toBe(1);
    expect(run.stdout).toContain("packages/web/src/a.tsx:1: [gray-on-color]");
  });
});
