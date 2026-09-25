import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const guard = resolve(import.meta.dirname, "../../scripts/comment-guard.mjs");

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "maestro-comment-guard-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function plant(path: string, content: string): void {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function runGuard(): { status: number | null; stdout: string } {
  const { status, stdout } = spawnSync(process.execPath, [guard, root], {
    encoding: "utf8",
  });
  return { status, stdout };
}

describe("comment guard", () => {
  it("passes a tree with no forbidden pattern", () => {
    plant(
      "packages/core/src/a.ts",
      "// Adds two numbers.\nexport const a = 1;\n",
    );
    plant("docs/adr/0001-x.md", "# ADR-0001\n\nSee ADR-0002.\n");

    expect(runGuard()).toEqual({ status: 0, stdout: "" });
  });

  it.each([
    "ADR-0012",
    "ADR 0012",
    "docs/research/735-coverage-map.md",
    "LEARNINGS.md",
    "docs/apm-behavior.md",
    ".claude/rules/testing.md",
    "docs/jobs.md",
    "design-principles",
    "(J07)",
  ])("fails a comment citing %s and names its file and line", (pointer) => {
    plant(
      "packages/web/src/b.tsx",
      `export const b = 1;\n// See ${pointer}.\n`,
    );

    const { status, stdout } = runGuard();

    expect(status).toBe(1);
    expect(stdout).toContain("packages/web/src/b.tsx:2");
  });

  it("finds a pointer inside a block comment and a JSX comment", () => {
    plant(
      "tests/c.tsx",
      "/**\n * Rule from ADR-0012.\n */\nexport const C = () => (\n  <div>{/* see LEARNINGS.md */}</div>\n);\n",
    );

    const { status, stdout } = runGuard();

    expect(status).toBe(1);
    expect(stdout).toContain("tests/c.tsx:2");
    expect(stdout).toContain("tests/c.tsx:5");
  });

  it("allows a pointer pattern in code, such as a deployed path", () => {
    plant(
      "packages/core/src/d.ts",
      'export const files = [".claude/skills/tdd/SKILL.md"];\n',
    );

    expect(runGuard()).toEqual({ status: 0, stdout: "" });
  });

  it("fails the operator's home path in code as well as in comments", () => {
    const home = ["", "Users", "michielmerks", "Projects"].join("/");
    plant("scripts/e.ts", `export const where = "${home}";\n`);

    const { status, stdout } = runGuard();

    expect(status).toBe(1);
    expect(stdout).toContain("scripts/e.ts:1");
  });

  it("ignores files outside the scanned folders and extensions", () => {
    plant("docs/research/f.ts", "// See ADR-0012.\n");
    plant("packages/core/src/g.mjs", "// See ADR-0012.\n");
    plant("packages/core/README.md", "See LEARNINGS.md.\n");
    plant("packages/core/node_modules/h/index.ts", "// See ADR-0012.\n");

    expect(runGuard()).toEqual({ status: 0, stdout: "" });
  });

  it("allows ADR pointers in docs/adr but fails the other patterns there", () => {
    plant("docs/adr/0002-y.md", "Supersedes ADR-0001.\n\nSee LEARNINGS.md.\n");

    const { status, stdout } = runGuard();

    expect(status).toBe(1);
    expect(stdout).toContain("docs/adr/0002-y.md:3");
    expect(stdout).not.toContain("docs/adr/0002-y.md:1");
  });
});
