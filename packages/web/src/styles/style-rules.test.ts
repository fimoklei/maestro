import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// DESIGN.md rules that no rendering test can see. The vitest/jsdom lane
// renders without CSS (LEARNINGS · web/styling-is-test-invisible), so a dropped
// utility stays green forever; these guards read the source instead.

// jsdom's import.meta.url isn't a file URL and cwd varies by invocation, so
// resolve the source root from whichever cwd applies (tokens-contrast.test.ts too).
const srcDirCandidate = ["packages/web/src", "src"]
  .map((candidate) => resolve(process.cwd(), candidate))
  .find((candidate) => existsSync(candidate));

if (!srcDirCandidate) {
  throw new Error(`web source tree not found from cwd ${process.cwd()}`);
}

const SRC_DIR: string = srcDirCandidate;

function sourceFiles(): string[] {
  return readdirSync(SRC_DIR, { recursive: true, encoding: "utf8" })
    .filter(
      (entry) =>
        /\.tsx?$/.test(entry) && !/\.(test|stories)\.tsx?$/.test(entry),
    )
    .map((entry) => join(SRC_DIR, entry));
}

const files = sourceFiles().map((path) => ({
  path,
  source: readFileSync(path, "utf8"),
}));

// A source tree with nothing in it would pass every rule below vacuously.
it("reads the web source tree", () => {
  expect(files.length).toBeGreaterThan(0);
});

// Preflight's ::placeholder mix (tailwindcss 4.3.2, preflight.css:282-296)
// falls under the 4.5:1 PRODUCT.md floor (PRODUCT.md:99); --text-dim clears it.
describe("placeholder colour", () => {
  it("every input with a placeholder sets placeholder:text-dim", () => {
    // Counted, not merely present: a file that gains a second input must
    // colour that one too, and a bare presence check would miss it.
    const count = (source: string, needle: string) =>
      source.split(needle).length - 1;

    const offenders = files
      .filter(
        ({ source }) =>
          count(source, 'placeholder="') >
          count(source, "placeholder:text-dim"),
      )
      .map(({ path }) => path.slice(SRC_DIR.length));

    expect(offenders).toEqual([]);
  });
});

// The UA paints native controls (checkbox, select popup, scrollbar, autofill)
// from color-scheme, not from data-theme, so without it an unchecked checkbox
// is pure white on the dark cockpit (issue #468). Both themes ship, so both
// blocks declare it beside their values (ADR-0033 §5).
describe("native control colour scheme", () => {
  const tokensCss = readFileSync(join(SRC_DIR, "styles/tokens.css"), "utf8");

  it.each([
    ["dark", '[data-theme="dark"]'],
    ["light", '[data-theme="light"]'],
  ])("the %s block declares its colour scheme", (theme, selector) => {
    const open = tokensCss.indexOf("{", tokensCss.indexOf(selector));
    const block = tokensCss.slice(open + 1, tokensCss.indexOf("}", open));

    expect(block).toMatch(new RegExp(`color-scheme:\\s*${theme};`));
  });
});

// ADR-0033: the token layer is replaced before any component is. Every
// Control Room name stays as an alias onto a new value until the job that
// rebuilds its last user, so a screen that was never touched still paints.
// The list is the pre-rebuild @theme block, written out so a dropped alias
// fails here instead of silently rendering an unstyled utility.
describe("Control Room token aliases", () => {
  const themeCss = readFileSync(join(SRC_DIR, "styles/theme.css"), "utf8");

  const aliases = [
    ...[
      "canvas",
      "chrome",
      "card",
      "inset",
      "active",
      "fg",
      "fg-2",
      "fg-3",
      "muted",
      "dim",
      "line-faint",
      "line-row",
      "line",
      "line-chip",
      "line-dashed",
      "line-drift",
      "line-amber-dim",
      "amber",
      "amber-hover",
      "amber-ink",
      "amber-bg",
      "amber-border",
      "green",
      "green-hover",
      "green-ink",
      "green-bg",
      "green-border",
      "danger-ink",
      "danger-bg",
      "danger-border",
      "dim-bg",
      "on-accent",
      "type-skill",
      "type-hook",
      "type-mcp",
      "type-bundle",
    ].map((name) => `--color-${name}`),
    ...["ui", "mono"].map((name) => `--font-${name}`),
    ...[
      "title",
      "subtitle",
      "body",
      "data",
      "desc",
      "mono-sm",
      "chip",
      "tag",
    ].map((name) => `--text-${name}`),
    ...["label", "tag"].map((name) => `--tracking-${name}`),
    ...["tag", "control", "item", "card"].map((name) => `--radius-${name}`),
    ...["card-x", "row-y", "header-y", "section"].map(
      (name) => `--spacing-${name}`,
    ),
  ];

  it.each(aliases)("%s still resolves", (alias) => {
    expect(themeCss).toContain(`${alias}:`);
  });
});

// DESIGN.md §3: the type ramp is a fixed vocabulary (--text-title … --text-tag)
// and the 10px Floor Rule forbids anything smaller. An arbitrary `text-[…]`
// value escapes both at once — and the colour ramp with them — so none pass.
describe("type ramp", () => {
  it("no component sets an arbitrary text value", () => {
    const offenders = files.flatMap(({ path, source }) =>
      [...source.matchAll(/text-\[[^\]]+\]/g)].map(
        (match) => `${path.slice(SRC_DIR.length)}: ${match[0]}`,
      ),
    );

    expect(offenders).toEqual([]);
  });
});

// #465: every warning, error and confirmation is stated through Notice, which
// derives the role — so no allowlist, the literal occurs nowhere, not even in
// the primitive. role="status" is unguarded on purpose (#615).
describe("assertive live regions", () => {
  it("no component writes a literal alert role", () => {
    const offenders = files.flatMap(({ path, source }) =>
      [...source.matchAll(/role=["']alert["']/g)].map(
        (match) => `${path.slice(SRC_DIR.length)}: ${match[0]}`,
      ),
    );

    expect(offenders).toEqual([]);
  });
});
