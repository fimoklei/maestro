import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const guard = resolve(import.meta.dirname, "../../scripts/design-guard.mjs");

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "maestro-design-guard-"));
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

const CLEAN = [
  'import { FolderGit2 } from "lucide-react";',
  'import { Icon } from "../ui/icon";',
  'import { ScreenStatusRegion, useScreenStatus } from "../ui/screen-status";',
  'import { StatusLine } from "../ui/status-line";',
  'import { ToastHost } from "../ui/toast";',
  'import { STATUS_TOKENS } from "../ui/status-family";',
  "export const A = () => (",
  '  <div className="text-gray-11">',
  "    <ToastHost />",
  '    <Icon of={FolderGit2} className="shrink-0 text-gray-11" />',
  "    <StatusLine>Connecting.</StatusLine>",
  "    <p className={STATUS_TOKENS.attention.ink}>Behind</p>",
  '    <input type="search" />',
  "  </div>",
  ");",
  "",
].join("\n");

describe("design guard", () => {
  it("passes feature code that composes the shared modules", () => {
    plant("packages/web/src/feature/a.tsx", CLEAN);

    expect(runGuard()).toEqual({ status: 0, stdout: "" });
  });

  it.each([
    [
      '<p role="status">Connecting.</p>',
      'role="status" outside ui: report through the table screen\'s region (useWriteAction, useScreenReport), useScreenStatus (ui/screen-status) in Settings, or StatusLine (ui/status-line)',
    ],
    [
      '<input type="checkbox" />',
      "raw checkbox outside ui: list checkable rows with GroupedList (ui/grouped-list)",
    ],
    [
      '<p className="mt-inline text-amber-12">Behind</p>',
      "colour class outside ui: pass a status family to STATUS_TOKENS (ui/status-family); a focus ring is FOCUS_RING (ui/focus-ring)",
    ],
    [
      '<a className={cn("rounded", "focus-visible:outline-blue-9")}>x</a>',
      "colour class outside ui: pass a status family to STATUS_TOKENS (ui/status-family); a focus ring is FOCUS_RING (ui/focus-ring)",
    ],
    [
      "<X strokeWidth={1.5} />",
      "icon styled by hand: use Icon (ui/icon) for the standard size and stroke",
    ],
    [
      "<X size={16} />",
      "icon styled by hand: use Icon (ui/icon) for the standard size and stroke",
    ],
    [
      '<X className="size-4 text-gray-11" />',
      "icon styled by hand: use Icon (ui/icon) for the standard size and stroke",
    ],
    [
      '<Icon of={X} className="size-3" />',
      "icon styled by hand: use Icon (ui/icon) for the standard size and stroke",
    ],
    [
      "<span>✎ Local edits</span>",
      "status glyph outside ui: take it from STATUS_TOKENS, LIST_TOKENS or WARNING_GLYPH (ui/status-family)",
    ],
    [
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the planted source is a template
      "`▲ Loses work · ${1}`",
      "status glyph outside ui: take it from STATUS_TOKENS, LIST_TOKENS or WARNING_GLYPH (ui/status-family)",
    ],
    [
      'reading("Pinned per skill", "neutral", "•")',
      "status glyph outside ui: take it from STATUS_TOKENS, LIST_TOKENS or WARNING_GLYPH (ui/status-family)",
    ],
    [
      'reading("Attention", "attention", "⚠")',
      "status glyph outside ui: take it from STATUS_TOKENS, LIST_TOKENS or WARNING_GLYPH (ui/status-family)",
    ],
  ])("fails %s and names the shared module", (jsx, message) => {
    plant(
      "packages/web/src/feature/b.tsx",
      [
        'import { X } from "lucide-react";',
        `export const B = () => ${jsx};`,
        "",
      ].join("\n"),
    );

    const { status, stdout } = runGuard();

    expect(status).toBe(1);
    expect(stdout).toBe(`packages/web/src/feature/b.tsx:2: ${message}\n`);
  });

  it("fails an icon stroke set through a spread object", () => {
    plant(
      "packages/web/src/feature/c.tsx",
      "const ICON = { size: 16, strokeWidth: 1.5 } as const;\n",
    );

    const { status, stdout } = runGuard();

    expect(status).toBe(1);
    expect(stdout).toBe(
      "packages/web/src/feature/c.tsx:1: icon styled by hand: use Icon (ui/icon) for the standard size and stroke\n",
    );
  });

  it.each([
    'import { toast } from "sonner";',
    'import { showSuccess } from "../ui/toast";',
  ])("fails %s and names the write action", (line) => {
    plant("packages/web/src/feature/d.ts", `${line}\n`);

    const { status, stdout } = runGuard();

    expect(status).toBe(1);
    expect(stdout).toBe(
      'packages/web/src/feature/d.ts:1: toast called directly: declare show: "toast" on useWriteAction (ui/use-write-action)\n',
    );
  });

  it.each([
    'import { StatusRegion } from "../ui/status-region";',
    'import { useStatusRegion } from "../ui/use-status-region";',
  ])("fails %s and names the purpose-built region", (line) => {
    plant("packages/web/src/feature/g.tsx", `${line}\n`);

    const { status, stdout } = runGuard();

    expect(status).toBe(1);
    expect(stdout).toBe(
      "packages/web/src/feature/g.tsx:1: generic status region outside ui: report through the table screen's region (useWriteAction, useScreenReport), or useScreenStatus (ui/screen-status) in Settings\n",
    );
  });

  it("leaves ui, tests, stories, helpers, fixtures and other packages alone", () => {
    const offending = [
      'import { toast } from "sonner";',
      'import { StatusRegion } from "./status-region";',
      'import { X } from "lucide-react";',
      'export const E = () => <p role="status" className="text-red-11"><X strokeWidth={2} /></p>;',
      "",
    ].join("\n");
    for (const path of [
      "packages/web/src/ui/e.tsx",
      "packages/web/src/feature/e.test.tsx",
      "packages/web/src/feature/e.stories.tsx",
      "packages/web/src/feature/e-test-helpers.tsx",
      "packages/web/src/test-utils.tsx",
      "packages/web/src/feature/e-fixture.tsx",
      "packages/core/src/e.tsx",
      "packages/web/src/node_modules/e/index.tsx",
    ]) {
      plant(path, offending);
    }

    expect(runGuard()).toEqual({ status: 0, stdout: "" });
  });

  it("ignores colour words in comments and copy", () => {
    plant(
      "packages/web/src/feature/f.tsx",
      [
        "// Amber: text-amber-12 is the attention ink, ↑ its glyph.",
        'export const f = "A red-1 release";',
        "",
      ].join("\n"),
    );

    expect(runGuard()).toEqual({ status: 0, stdout: "" });
  });
});
