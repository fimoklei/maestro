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

  it("refuses the hover card outside the shared building blocks", () => {
    const source =
      'import { HoverCard } from "../ui/hover-card";\nexport const h = HoverCard;\n';

    expect(lint("packages/web/src/harness/probe.tsx", source)).toContain(
      "Declare a card on the column",
    );
    expect(
      lint(
        "packages/web/src/ui/probe.tsx",
        'import { HoverCard } from "./hover-card";\nexport const h = HoverCard;\n',
      ),
    ).not.toContain("Declare a card on the column");
  });

  it("refuses a native title in a table cell and allows it elsewhere", () => {
    const cell =
      "export const c = (name: string) => <span title={name}>{name}</span>;\n";
    const message = "Mark the column name: true";

    expect(lint("packages/web/src/harness/probe-columns.tsx", cell)).toContain(
      message,
    );
    expect(lint("packages/web/src/harness/probe-cell.tsx", cell)).toContain(
      message,
    );
    expect(
      lint(
        "packages/web/src/harness/probe-columns.tsx",
        "export const c = (name: string) => <span>{name}</span>;\n",
      ),
    ).not.toContain(message);
    expect(lint("packages/web/src/harness/probe-pane.tsx", cell)).not.toContain(
      message,
    );
  });

  it("allows a component prop named title in a table cell", () => {
    expect(
      lint(
        "packages/web/src/harness/probe-cell.tsx",
        "export const c = (name: string) => <Pane title={name} />;\n",
      ),
    ).not.toContain("Mark the column name: true");
  });

  it("refuses the data table's card outside the shared building blocks and allows its types", () => {
    const message = "Only the data table draws";

    expect(
      lint(
        "packages/web/src/harness/probe.tsx",
        'import { DataTableCard } from "../ui/data-table-card";\nexport const h = DataTableCard;\n',
      ),
    ).toContain(message);
    expect(
      lint(
        "packages/web/src/harness/probe.tsx",
        'import type { DataTableCardContent } from "../ui/data-table-card";\nexport type H = DataTableCardContent;\n',
      ),
    ).not.toContain(message);
  });

  it("refuses a file name that is not kebab-case", () => {
    expect(
      lint("packages/web/src/HarnessView.tsx", "export const a = 1;\n"),
    ).toContain("useFilenamingConvention");
  });
});
