import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const repo = resolve(import.meta.dirname, "../..");
const biome = resolve(repo, "node_modules/@biomejs/biome/bin/biome");

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "maestro-lint-rules-"));
  cpSync(join(repo, "biome.json"), join(root, "biome.json"));
  cpSync(join(repo, "biome-plugins"), join(root, "biome-plugins"), {
    recursive: true,
  });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function lint(path: string, source: string): string {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, source);
  const { stdout, stderr } = spawnSync(
    process.execPath,
    [biome, "lint", "--vcs-enabled=false", "--max-diagnostics=50", path],
    { cwd: root, encoding: "utf8" },
  );
  return stdout + stderr;
}

describe("lint rules", () => {
  it("refuses a value import from core in web and allows a type import", () => {
    expect(
      lint(
        "packages/web/src/probe.ts",
        'import { deploy } from "@maestro/core";\nexport const d = deploy;\n',
      ),
    ).toContain("Web imports only types from @maestro/core");
    expect(
      lint(
        "packages/web/src/probe.ts",
        'import type { Skill } from "@maestro/core";\nexport type S = Skill;\n',
      ),
    ).not.toContain("Web imports only types from @maestro/core");
  });

  it("allows a value import from core outside web", () => {
    expect(
      lint(
        "packages/server/src/probe.ts",
        'import { deploy } from "@maestro/core";\nexport const d = deploy;\n',
      ),
    ).not.toContain("Web imports only types from @maestro/core");
  });

  it("refuses exec and shell: true when starting a process", () => {
    const output = lint(
      "packages/core/src/probe.ts",
      'import { exec, execFile } from "node:child_process";\nexecFile("git", ["status"], { shell: true });\nexec("ls");\n',
    );

    expect(output).toContain(
      "Start a process with execFile or spawn and an args array.",
    );
    expect(output).toContain("Remove shell: true.");
  });

  it("refuses a file name that is not kebab-case", () => {
    expect(
      lint("packages/web/src/HarnessView.tsx", "export const a = 1;\n"),
    ).toContain("useFilenamingConvention");
  });
});
