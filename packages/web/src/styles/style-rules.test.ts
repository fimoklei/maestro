import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// DESIGN.md rules that no rendering test can see. The vitest/happy-dom lane
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
// falls under the 4.5:1 PRODUCT.md floor (PRODUCT.md:99); gray 11 clears it.
describe("placeholder colour", () => {
  it("every input with a placeholder sets placeholder:text-gray-11", () => {
    // Counted, not merely present: a file that gains a second input must
    // colour that one too, and a bare presence check would miss it.
    const count = (source: string, needle: string) =>
      source.split(needle).length - 1;

    const offenders = files
      .filter(
        ({ source }) =>
          count(source, 'placeholder="') >
          count(source, "placeholder:text-gray-11"),
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

// ADR-0033 job 11 deleted the Control Room aliases. Each name below is one the
// pre-rebuild @theme block carried and the new system does not, so neither
// theme.css nor a utility, variable or class may bring one back.
const ALIASES: Record<string, string[]> = {
  color: [
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
  ],
  text: ["subtitle", "body", "data", "desc", "mono-sm", "chip", "tag"],
  tracking: ["label", "tag"],
  radius: ["tag", "item", "card"],
  spacing: ["card-x", "row-y", "header-y"],
};

const either = (names: string[]) => `(?:${names.join("|")})`;
const COLOR_UTILITY =
  "(?:bg|text|border(?:-[trblxyse])?|ring|ring-offset|outline|divide|fill|stroke|decoration|accent|caret|shadow|from|via|to)";
const aliasPattern = new RegExp(
  `(?<![\\w-])(?:${[
    `${COLOR_UTILITY}-${either(ALIASES.color ?? [])}`,
    `text-${either(ALIASES.text ?? [])}`,
    `tracking-${either(ALIASES.tracking ?? [])}`,
    `rounded(?:-[trblse]{1,2})?-${either(ALIASES.radius ?? [])}`,
    `[a-z-]+-${either(ALIASES.spacing ?? [])}`,
    "m-label",
    "m-mono",
    ...Object.entries(ALIASES).map(
      ([kind, names]) => `--${kind}-${either(names)}`,
    ),
  ].join("|")})(?![\\w-])`,
  "g",
);
const aliasesIn = (source: string) =>
  [...source.matchAll(aliasPattern)].map((match) => match[0]);

describe("Control Room token aliases", () => {
  it("flags an alias and passes the token it resolved to", () => {
    expect(
      aliasesIn(
        'className="text-fg-2 hover:bg-amber-bg/50 rounded-item m-label" style={{ color: "var(--color-muted)" }}',
      ),
    ).toEqual([
      "text-fg-2",
      "bg-amber-bg",
      "rounded-item",
      "m-label",
      "--color-muted",
    ]);
    expect(
      aliasesIn(
        'className="text-gray-12 bg-amber-3 text-amber-11 rounded-control text-meta tracking-heading"',
      ),
    ).toEqual([]);
  });

  it("theme.css declares no alias", () => {
    const themeCss = readFileSync(join(SRC_DIR, "styles/theme.css"), "utf8");

    expect(aliasesIn(themeCss)).toEqual([]);
  });

  it("no source, test, story or stylesheet names an alias", () => {
    const webDir = resolve(SRC_DIR, "..");
    const offenders = [SRC_DIR, join(webDir, ".storybook")]
      .flatMap((dir) =>
        readdirSync(dir, { recursive: true, encoding: "utf8" })
          .filter((entry) => /\.(tsx?|css|mdx)$/.test(entry))
          .map((entry) => join(dir, entry)),
      )
      .filter((path) => !path.endsWith("style-rules.test.ts"))
      .flatMap((path) =>
        aliasesIn(readFileSync(path, "utf8")).map(
          (alias) => `${path.slice(webDir.length)}: ${alias}`,
        ),
      );

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

// Letter-spacing is a token too (frontend.md): tracking-heading … tracking-mono-wide.
describe("letter-spacing", () => {
  it("no component sets an arbitrary tracking value", () => {
    const offenders = files.flatMap(({ path, source }) =>
      [...source.matchAll(/tracking-\[[^\]]+\]/g)].map(
        (match) => `${path.slice(SRC_DIR.length)}: ${match[0]}`,
      ),
    );

    expect(offenders).toEqual([]);
  });
});

// design.md §1: blue only for focus, selection and links; every ring is blue-9.
describe("focus ring colour", () => {
  it("every focus outline is blue-9", () => {
    const offenders = files.flatMap(({ path, source }) =>
      [
        ...source.matchAll(
          /focus(?:-visible)?:outline-(?!offset|none|\d)[\w-]+/g,
        ),
      ]
        .filter((match) => match[0] !== "focus-visible:outline-blue-9")
        .map((match) => `${path.slice(SRC_DIR.length)}: ${match[0]}`),
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

// ADR-0033 §8: under reduced motion only the spinner moves. A transition or
// animation utility needs the motion-safe: variant; a CSS declaration needs a
// no-preference media block. Toasts are sonner's, which stills itself.
const SPINNER_FILE = "/ui/button.tsx";
const NO_PREFERENCE = "@media (prefers-reduced-motion: no-preference)";

function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

/** Class tokens and inline styles that move whatever the reader asked for. */
function unguardedMotion(source: string): string[] {
  const stripped = withoutComments(source);
  const utilities = (stripped.match(/[^\s"'`{}()]+/g) ?? []).filter((token) => {
    const variants = token.split(/:(?![^[]*\])/);
    const utility = variants.pop() ?? "";
    return (
      /^(transition(-|$)|animate-|\[(animation|transition))/.test(utility) &&
      !/-none$/.test(utility) &&
      !variants.includes("motion-safe")
    );
  });
  const styles =
    stripped.match(/\b(animation|transition)[A-Za-z]*\s*:\s*["'`\d]/g) ?? [];
  return [...utilities, ...styles];
}

/** CSS animation and transition declarations outside a no-preference block. */
function unguardedCssMotion(css: string): string[] {
  const stripped = withoutComments(css);
  const guarded: Array<[number, number]> = [];
  for (
    let at = stripped.indexOf(NO_PREFERENCE);
    at !== -1;
    at = stripped.indexOf(NO_PREFERENCE, at + 1)
  ) {
    const open = stripped.indexOf("{", at);
    let depth = 0;
    let close = open;
    for (; close < stripped.length; close++) {
      if (stripped[close] === "{") depth++;
      if (stripped[close] === "}" && --depth === 0) break;
    }
    guarded.push([open, close]);
  }
  return [...stripped.matchAll(/(animation|transition)[a-z-]*\s*:[^;]*/g)]
    .filter(
      ({ index }) =>
        !guarded.some(([open, close]) => index > open && index < close),
    )
    .map((match) => match[0]);
}

describe("reduced motion", () => {
  it("flags a utility without motion-safe and passes one with it", () => {
    expect(
      unguardedMotion(
        'className="transition-opacity data-[state=open]:animate-in [animation-duration:1s] motion-safe:transition-colors motion-safe:animate-pulse" // a transition',
      ),
    ).toEqual([
      "transition-opacity",
      "data-[state=open]:animate-in",
      "[animation-duration:1s]",
    ]);
    expect(unguardedMotion('style={{ transition: "opacity 1s" }}')).toEqual([
      'transition: "',
    ]);
    expect(unguardedMotion('import { X } from "./hover-transition";')).toEqual(
      [],
    );
    expect(unguardedMotion('className="animate-none transition-none"')).toEqual(
      [],
    );
  });

  it("flags a CSS declaration outside the no-preference block", () => {
    const css = `.a { transition: opacity 1s; }
${NO_PREFERENCE} { .b { animation: spin 1s; } }
.c { animation-name: spin; }`;
    expect(unguardedCssMotion(css)).toEqual([
      "transition: opacity 1s",
      "animation-name: spin",
    ]);
  });

  it("only the spinner moves without the motion-safe variant", () => {
    const offenders = files
      .filter(({ path }) => !path.endsWith(SPINNER_FILE))
      .flatMap(({ path, source }) =>
        unguardedMotion(source).map(
          (token) => `${path.slice(SRC_DIR.length)}: ${token}`,
        ),
      );

    expect(offenders).toEqual([]);
  });

  it("the spinner keeps turning under reduced motion", () => {
    const spinner = files.find(({ path }) => path.endsWith(SPINNER_FILE));

    expect(unguardedMotion(spinner?.source ?? "")).toContain("animate-spin");
  });

  it.each(
    readdirSync(join(SRC_DIR, "styles")).filter((name) =>
      name.endsWith(".css"),
    ),
  )("styles/%s moves only inside the no-preference block", (name) => {
    const css = readFileSync(join(SRC_DIR, "styles", name), "utf8");

    expect(unguardedCssMotion(css)).toEqual([]);
  });
});

// ADR-0033 §1: a status scale puts text on step 12 and the mark on step 11. In
// light, green and amber 11 miss 4.5:1 on gray 2 and on their own tint (#1086),
// so step 11 colours only a glyph: aria-hidden, role="img", or a MARK constant.
const STEP_ELEVEN = /text-(?:green|amber)-11\b/;
const MARK_CONTEXT = /aria-hidden="true"|role="img"|\bglyph:|const \w*MARK\w*/;

function wordsOnStepEleven(source: string): string[] {
  const lines = source.split("\n");
  return lines.flatMap((line, index) => {
    if (!STEP_ELEVEN.test(line)) return [];
    const context = lines.slice(Math.max(0, index - 10), index + 1).join("\n");
    return MARK_CONTEXT.test(context) ? [] : [line.trim()];
  });
}

describe("status step 11 marks, never words", () => {
  it("flags a word on step 11 and passes a mark", () => {
    expect(
      wordsOnStepEleven(`const INK = { good: "text-green-11" };
<p className="text-amber-11">Behind</p>
<span aria-hidden="true" className="text-green-11">✓</span>
const MARK = { good: "text-green-11" };
  attention: { glyph: "text-amber-11" },`),
    ).toEqual([
      'const INK = { good: "text-green-11" };',
      '<p className="text-amber-11">Behind</p>',
    ]);
  });

  it("no source file colours a word with green or amber 11", () => {
    const offenders = files.flatMap(({ path, source }) =>
      wordsOnStepEleven(source).map(
        (line) => `${path.slice(SRC_DIR.length)}: ${line}`,
      ),
    );

    expect(offenders).toEqual([]);
  });
});
