import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BASELINE,
  checkRatchet,
  countCommentLines,
} from "../../scripts/comment-ratchet.mjs";

const ratchet = resolve(
  import.meta.dirname,
  "../../scripts/comment-ratchet.mjs",
);

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "maestro-comment-ratchet-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function plant(path: string, content: string): void {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function baseline(counts: Record<string, number>): void {
  plant(BASELINE, `${JSON.stringify(counts, null, 2)}\n`);
}

function run(...args: string[]) {
  return spawnSync(process.execPath, [ratchet, root, ...args], {
    encoding: "utf8",
  });
}

describe("comment ratchet", () => {
  it("counts every line a comment touches, per file", () => {
    plant(
      "packages/core/src/a.ts",
      "// one\n// two\nexport const a = 1; // three\n/**\n * four\n */\n",
    );
    plant("tests/b.tsx", "export const B = () => <div>{/* one */}</div>;\n");
    plant("scripts/c.mjs", "export const c = 1;\n");

    expect(countCommentLines(root)).toEqual({
      "packages/core/src/a.ts": 6,
      "tests/b.tsx": 1,
    });
  });

  it.each([
    "// biome-ignore lint/style/noNonNullAssertion: x",
    "// @ts-expect-error wrong on purpose",
    ["// @vitest", "environment node"].join("-"),
    '/// <reference types="vite/client" />',
  ])("does not count the tool directive %s", (directive) => {
    plant("packages/web/src/d.ts", `${directive}\nexport const d = 1;\n`);

    expect(countCommentLines(root)).toEqual({});
  });

  it("passes a tree that matches its baseline", () => {
    plant("packages/core/src/a.ts", "// one\nexport const a = 1;\n");
    baseline({ "packages/core/src/a.ts": 1 });

    expect(checkRatchet(root)).toEqual([]);
  });

  it("fails a new comment in a file with no baseline entry", () => {
    plant("packages/core/src/a.ts", "// one\nexport const a = 1;\n");
    baseline({});

    expect(checkRatchet(root)).toEqual([
      "packages/core/src/a.ts: 1 comment lines, baseline 0",
    ]);
  });

  it("fails a file that grew past its baseline", () => {
    plant("packages/core/src/a.ts", "// one\n// two\nexport const a = 1;\n");
    baseline({ "packages/core/src/a.ts": 1 });

    expect(checkRatchet(root)).toEqual([
      "packages/core/src/a.ts: 2 comment lines, baseline 1",
    ]);
  });

  it("fails a baseline that is higher than the file, so a drop is locked in", () => {
    plant("packages/core/src/a.ts", "export const a = 1;\n");
    baseline({ "packages/core/src/a.ts": 3, "packages/gone.ts": 1 });

    expect(checkRatchet(root)).toEqual([
      "packages/core/src/a.ts: 0 comment lines, baseline 3 (stale)",
      "packages/gone.ts: 0 comment lines, baseline 1 (stale)",
    ]);
  });

  it("exits 1 and prints each offender", () => {
    plant("packages/core/src/a.ts", "// one\nexport const a = 1;\n");
    baseline({});

    const result = run();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("packages/core/src/a.ts: 1 comment lines");
  });

  it("--update lowers the baseline to the current counts", () => {
    plant("packages/core/src/a.ts", "// one\nexport const a = 1;\n");
    baseline({ "packages/core/src/a.ts": 3, "packages/gone.ts": 1 });

    expect(run("--update").status).toBe(0);
    expect(JSON.parse(readFileSync(join(root, BASELINE), "utf8"))).toEqual({
      "packages/core/src/a.ts": 1,
    });
    expect(run().status).toBe(0);
  });

  it("--update refuses to raise the baseline", () => {
    plant("packages/core/src/a.ts", "// one\n// two\nexport const a = 1;\n");
    baseline({ "packages/core/src/a.ts": 1 });

    const result = run("--update");

    expect(result.status).toBe(1);
    expect(JSON.parse(readFileSync(join(root, BASELINE), "utf8"))).toEqual({
      "packages/core/src/a.ts": 1,
    });
  });
});
