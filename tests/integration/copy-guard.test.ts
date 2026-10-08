import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const guard = resolve(import.meta.dirname, "../../scripts/copy-guard.mjs");

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "maestro-copy-guard-"));
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

describe("copy guard", () => {
  it("passes copy that uses the current screen words", () => {
    plant(
      "packages/web/src/a-copy.ts",
      [
        'export const a = "Set the Harness location, then select Re-read Inventory.";',
        'export const b = "Read just now";',
        'export const c = "Is it 1 !== 2?";',
        'export const d = "The Harness already holds a skill under it. Pick another name.";',
        "",
      ].join("\n"),
    );

    expect(runGuard()).toEqual({ status: 0, stdout: "" });
  });

  it.each([
    ["the Inventory source screen", "Inventory source"],
    ["Maestro refreshed Inventory.", "refreshed"],
    ["Select Retry check to read it again.", "Retry check"],
    ["Select Plan release first.", "Plan release"],
    ["The Harness was fetched.", "fetched"],
    ["This skill is Deprecated now.", "Deprecated"],
    ["Deprecated", "Deprecated"],
    ["The skill is up-to-date.", "up-to-date"],
    ["The target shows drift today.", "drift"],
    ["The skill folder is a symlink here.", "symlink"],
    ["Press Close to finish.", "Press Close"],
    ["Then click Deploy skill.", "click"],
    ["Click here to continue.", "Click"],
    ["Tapping the row opens it.", "Tapping"],
    ["The Release head moved.", "Release head"],
    ["Reload the view to see it.", "Reload the view"],
    ["The skill slug is taken.", "slug"],
    ["Holds primitives deployed from it.", "primitives"],
    ["Deploy skills seamlessly to every target.", "seamless"],
    ["Unlock the full Harness.", "Unlock"],
    ["An AI-powered review of each skill.", "AI-powered"],
    ["Oops, the read failed.", "Oops"],
    ["Let's deploy the skill.", "Let's"],
    ["Deployed tdd! Select Close.", "!"],
    ["Deployed tdd!", "!"],
    ["Nothing was copied. Pick the folder again.", "Pick the"],
    ["Make the folder readable, then pick it again.", "pick it"],
    ["None yet", "None yet"],
    ["Nothing released yet", "Nothing released yet"],
    ["Remove skill — checks still running", "checks still running"],
    ["No repositories registered yet.", "repositories registered yet"],
  ])("fails a string saying %j and names the word", (sentence, word) => {
    plant(
      "packages/web/src/b-copy.ts",
      `export const n = 1;\nexport const b = ${JSON.stringify(sentence)};\n`,
    );

    const { status, stdout } = runGuard();

    expect(status).toBe(1);
    expect(stdout).toBe(`packages/web/src/b-copy.ts:2: ${word}\n`);
  });

  it("reads JSX text, attributes and the text parts of a template", () => {
    plant(
      "packages/web/src/c.tsx",
      [
        "export const C = ({ tag }: { tag: string }) => (",
        `  <p title={\`Tagged \${tag} and refreshed Inventory\`}>`,
        "    Open the folder picker now",
        "  </p>",
        ");",
        "",
      ].join("\n"),
    );

    const { status, stdout } = runGuard();

    expect(status).toBe(1);
    expect(stdout).toContain("packages/web/src/c.tsx:2: refreshed");
    expect(stdout).toContain("packages/web/src/c.tsx:3: picker");
  });

  it("fails a one-word lowercase retired word that reaches a sentence", () => {
    plant(
      "packages/web/src/g.tsx",
      [
        "export const g = (n: number) =>",
        // biome-ignore lint/suspicious/noTemplateCurlyInString: planted source text
        '  `${n} ${n === 1 ? "primitive" : "items"}`;',
        "export const G = ({ n }: { n: number }) => (",
        '  <p>{n === 1 ? "drift" : "items"}</p>',
        ");",
        "",
      ].join("\n"),
    );

    const { status, stdout } = runGuard();

    expect(status).toBe(1);
    expect(stdout).toBe(
      "packages/web/src/g.tsx:2: primitive\npackages/web/src/g.tsx:4: drift\n",
    );
  });

  it("passes a lowercase code compared, keyed or passed inside a sentence", () => {
    plant(
      "packages/web/src/h.tsx",
      [
        "type Row = { state: string; on: (key: string) => string };",
        "export const h = (row: Row) =>",
        // biome-ignore lint/suspicious/noTemplateCurlyInString: planted source text
        '  `${row.state === "drift" ? "Behind" : row.on("fetch")}`;',
        "export const H = ({ row }: { row: Row }) => (",
        "  <p>",
        '    {row.state === "drift" ? "Behind" : ["primitives"].join("")}',
        "  </p>",
        ");",
        "",
      ].join("\n"),
    );

    expect(runGuard()).toEqual({ status: 0, stdout: "" });
  });

  it("fails a one-word retired word shown as a display value, returned or held in a const", () => {
    plant(
      "packages/web/src/i.ts",
      [
        'export const tab = { label: "primitives" };',
        "export function word(): string {",
        '  return "slugs";',
        "}",
        'export const shown = () => "picker";',
        'export const UNIT = "symlink";',
        "",
      ].join("\n"),
    );

    const { status, stdout } = runGuard();

    expect(status).toBe(1);
    expect(stdout).toBe(
      [
        "packages/web/src/i.ts:1: primitives",
        "packages/web/src/i.ts:3: slugs",
        "packages/web/src/i.ts:5: picker",
        "packages/web/src/i.ts:6: symlink",
        "",
      ].join("\n"),
    );
  });

  it("passes a code held as a value: a state, a query key, a type, an event or a hyphenated code", () => {
    plant(
      "packages/web/src/j.ts",
      [
        "type Counts = { primitives: number; skills: number };",
        'export type Only = Pick<Counts, "primitives">;',
        'export const row = { state: "drift", queryKey: ["drift"] };',
        'export const on = () => window.addEventListener("refresh", () => {});',
        "export function reading(known: boolean): string {",
        '  return known ? "unknown" : "up-to-date";',
        "}",
        'export const KIND = "drift" as const;',
        "",
      ].join("\n"),
    );

    expect(runGuard()).toEqual({ status: 0, stdout: "" });
  });

  it("reads server messages as well", () => {
    plant(
      "packages/server/src/d.ts",
      'export const d = { message: "Nothing was fetched. Reload the page." };\n',
    );

    const { status, stdout } = runGuard();

    expect(status).toBe(1);
    expect(stdout).toContain("packages/server/src/d.ts:1: fetched");
  });

  it("ignores retired words in comments, identifiers, codes and routes", () => {
    plant(
      "packages/web/src/e.ts",
      [
        "// The drift view refreshed the symlink picker.",
        "const refreshDrift = (primitive: string) => primitive;",
        'export const route = "/api/harness/refresh";',
        'export const code = "destination-symlinked";',
        'export const status = "up-to-date";',
        'export const call = refreshDrift("fetch");',
        "",
      ].join("\n"),
    );

    expect(runGuard()).toEqual({ status: 0, stdout: "" });
  });

  it("ignores tests, stories, test helpers, fixtures and other folders", () => {
    const sentence = 'export const f = "Maestro refreshed Inventory.";\n';
    for (const path of [
      "packages/web/src/f.test.ts",
      "packages/web/src/f.test.tsx",
      "packages/web/src/f.stories.tsx",
      "packages/web/src/f-test-helpers.tsx",
      "packages/web/src/test-utils.tsx",
      "packages/web/src/f-fixture.tsx",
      "packages/core/src/f.ts",
      "tests/integration/f.test.ts",
      "packages/web/src/node_modules/f/index.ts",
    ]) {
      plant(path, sentence);
    }

    expect(runGuard()).toEqual({ status: 0, stdout: "" });
  });
});
