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

// DESIGN.md §2: hierarchy comes from lightness steps. The UA paints native
// controls (checkbox, select popup, scrollbar, autofill) from color-scheme, not
// from data-theme, so without this every unchecked checkbox is pure white —
// brighter than --text-1 — and drowns out the amber checked state (issue #468).
describe("native control colour scheme", () => {
  it("theme.css declares a dark color-scheme", () => {
    const themeCss = readFileSync(join(SRC_DIR, "styles/theme.css"), "utf8");

    expect(themeCss).toMatch(/color-scheme:\s*dark;/);
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
