import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const guard = resolve(import.meta.dirname, "../../scripts/rules-guard.mjs");

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "maestro-rules-guard-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function plant(path: string, content = ""): void {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function scoped(...patterns: string[]): string {
  const list = patterns.map((p) => `  - "${p}"`).join("\n");
  return `---\npaths:\n${list}\n---\n\n# Rule\n`;
}

function runGuard(): { status: number | null; stdout: string } {
  const { status, stdout } = spawnSync(process.execPath, [guard, root], {
    encoding: "utf8",
  });
  return { status, stdout };
}

describe("rules guard", () => {
  it("passes scoped rules whose patterns all match a file, and the always-loaded rules", () => {
    plant("packages/web/src/a.tsx");
    plant("packages/core/src/b.test.ts");
    plant(".claude/rules/frontend.md", scoped("packages/web/**"));
    plant(".claude/rules/testing.md", scoped("**/*.test.{ts,tsx}"));
    plant(".claude/rules/architecture.md", "# Architecture\n");
    plant(".claude/rules/security.md", "# Security\n");

    expect(runGuard()).toEqual({ status: 0, stdout: "" });
  });

  it("fails a pattern that matches no file and names the rule and the pattern", () => {
    plant("packages/web/src/a.tsx");
    plant(
      ".claude/rules/apm-driver.md",
      scoped("packages/web/**", "packages/core/src/renamed/**"),
    );

    const { status, stdout } = runGuard();

    expect(status).toBe(1);
    expect(stdout).toContain(
      ".claude/rules/apm-driver.md: packages/core/src/renamed/** matches no file",
    );
    expect(stdout).not.toContain("packages/web/**");
  });

  it("fails an unscoped rule that is not one of the always-loaded rules", () => {
    plant(".claude/rules/copy.md", "# Copy\n");

    const { status, stdout } = runGuard();

    expect(status).toBe(1);
    expect(stdout).toContain(
      ".claude/rules/copy.md: no paths frontmatter, so it loads in every session",
    );
  });

  it("ignores files under node_modules and nested worktrees when matching", () => {
    plant("node_modules/pkg/x.test.ts");
    plant(".claude/worktrees/other/packages/web/src/a.tsx");
    plant(".claude/rules/testing.md", scoped("**/*.test.ts"));
    plant(".claude/rules/frontend.md", scoped("**/packages/web/**"));

    const { status, stdout } = runGuard();

    expect(status).toBe(1);
    expect(stdout).toContain("**/*.test.ts matches no file");
    expect(stdout).toContain("**/packages/web/** matches no file");
  });

  it("passes the repository's own rules", () => {
    const { status, stdout } = spawnSync(process.execPath, [guard], {
      encoding: "utf8",
    });

    expect({ status, stdout }).toEqual({ status: 0, stdout: "" });
  });
});
