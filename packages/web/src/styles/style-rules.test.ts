import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Two DESIGN.md rules that no rendering test can see. The vitest/jsdom lane
// renders without CSS (LEARNINGS · web/styling-is-test-invisible), so a dropped
// utility stays green forever; these guards read the source instead.

// Vitest runs this project from either the repo root or packages/web depending
// on how it is invoked, and jsdom's import.meta.url is not a file URL, so
// resolve the source root from whichever cwd applies (tokens-contrast.test.ts
// does the same).
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

// An unstyled ::placeholder is not the text colour: Tailwind's preflight sets it
// to `color-mix(in oklab, currentcolor 50%, transparent)`
// (tailwindcss 4.3.2, preflight.css:282-296). Halving the ramp's brightest step
// lands under the 4.5:1 PRODUCT.md commits to for body text (PRODUCT.md:99), and
// no token guards a pseudo-element. --text-dim is the ramp step that clears it on
// every surface (tokens.css:38-41, guarded by tokens-contrast.test.ts), so every
// placeholder names it explicitly rather than inheriting the mix.
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
