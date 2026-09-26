import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// A new foreground/background pairing enters this table, and passes, first (#988).

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

type Pair = {
  readonly name: string;
  readonly floor: number;
  readonly foregrounds: readonly string[];
  readonly backgrounds: readonly string[];
};

const SLATE_1_TO_5 = [
  "gray-1",
  "gray-2",
  "gray-3",
  "gray-4",
  "gray-5",
] as const;

const PAIRS: readonly Pair[] = [
  {
    name: "Text: slate 12 on slate 1-5",
    floor: AA_TEXT,
    foregrounds: ["gray-12"],
    backgrounds: SLATE_1_TO_5,
  },
  {
    name: "Muted text: slate 11 on slate 1-5",
    floor: AA_TEXT,
    foregrounds: ["gray-11"],
    backgrounds: SLATE_1_TO_5,
  },
  {
    name: "Text on selected row: slate 12 / 11 on blue 5",
    floor: AA_TEXT,
    foregrounds: ["gray-12", "gray-11"],
    backgrounds: ["blue-5"],
  },
  {
    name: "Primary button: slate 1 on slate 12 / hover 11",
    floor: AA_TEXT,
    foregrounds: ["gray-1"],
    backgrounds: ["gray-12", "gray-11"],
  },
  {
    name: "Link: blue 11 on slate 1-2",
    floor: AA_TEXT,
    foregrounds: ["blue-11"],
    backgrounds: ["gray-1", "gray-2"],
  },
  {
    name: "Focus ring: blue 9 vs slate 1-2",
    floor: AA_NON_TEXT,
    foregrounds: ["blue-9"],
    backgrounds: ["gray-1", "gray-2"],
  },
  {
    name: "Field and checkbox border: slate 9 vs slate 1-2",
    floor: AA_NON_TEXT,
    foregrounds: ["gray-9"],
    backgrounds: ["gray-1", "gray-2"],
  },
  {
    name: "Good text: green 12 on green 3",
    floor: AA_TEXT,
    foregrounds: ["green-12"],
    backgrounds: ["green-3"],
  },
  {
    name: "Good marker: green 11 on green 3",
    floor: AA_NON_TEXT,
    foregrounds: ["green-11"],
    backgrounds: ["green-3"],
  },
  {
    name: "Good marker: green 11 on slate 1-2",
    floor: AA_NON_TEXT,
    foregrounds: ["green-11"],
    backgrounds: ["gray-1", "gray-2"],
  },
  {
    name: "Attention text: amber 12 on amber 3",
    floor: AA_TEXT,
    foregrounds: ["amber-12"],
    backgrounds: ["amber-3"],
  },
  {
    name: "Attention marker: amber 11 on amber 3",
    floor: AA_NON_TEXT,
    foregrounds: ["amber-11"],
    backgrounds: ["amber-3"],
  },
  {
    name: "Attention marker: amber 11 on slate 1-2",
    floor: AA_NON_TEXT,
    foregrounds: ["amber-11"],
    backgrounds: ["gray-1", "gray-2"],
  },
  {
    name: "Failed text: red 12 on red 3",
    floor: AA_TEXT,
    foregrounds: ["red-12"],
    backgrounds: ["red-3"],
  },
  {
    name: "Failed marker: red 11 on red 3",
    floor: AA_NON_TEXT,
    foregrounds: ["red-11"],
    backgrounds: ["red-3"],
  },
  {
    name: "Failed marker: red 11 on slate 1-2",
    floor: AA_NON_TEXT,
    foregrounds: ["red-11"],
    backgrounds: ["gray-1", "gray-2"],
  },
  {
    name: "Destructive button text: red 11 on slate 1-2",
    floor: AA_TEXT,
    foregrounds: ["red-11"],
    backgrounds: ["gray-1", "gray-2"],
  },
  {
    name: "Status text on the page: green / amber / red 12 on slate 1-3",
    floor: AA_TEXT,
    foregrounds: ["green-12", "amber-12", "red-12"],
    backgrounds: ["gray-1", "gray-2", "gray-3"],
  },
  {
    name: "Text in a status box: slate 12 / 11 on green / amber / red 3",
    floor: AA_TEXT,
    foregrounds: ["gray-12", "gray-11"],
    backgrounds: ["green-3", "amber-3", "red-3"],
  },
];

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// Vitest runs from the repo root or packages/web depending on invocation.
const tokensCssPath = [
  "packages/web/src/styles/tokens.css",
  "src/styles/tokens.css",
]
  .map((candidate) => resolve(process.cwd(), candidate))
  .find((candidate) => existsSync(candidate));

if (!tokensCssPath) {
  throw new Error(`tokens.css not found from cwd ${process.cwd()}`);
}

const tokensCss = readFileSync(tokensCssPath, "utf8");

// Both themes ship, in one block each. tokens.css declares no nested braces, so
// a block runs from its selector's "{" to the next "}".
function parseThemeBlock(
  css: string,
  selector: string,
): Record<string, string> {
  const start = css.indexOf(selector);
  if (start === -1) {
    throw new Error(`theme block ${selector} not found in tokens.css`);
  }
  const open = css.indexOf("{", start);
  const block = css.slice(open + 1, css.indexOf("}", open));
  const tokens: Record<string, string> = {};
  for (const match of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    const [, name, hex] = match;
    if (name && hex) {
      tokens[name] = hex;
    }
  }
  return tokens;
}

const THEMES = [
  ["dark", '[data-theme="dark"]'],
  ["light", '[data-theme="light"]'],
] as const;

// Page lines sit near 1.2:1, where Linear and Vercel draw theirs (#1199):
// visible, yet quieter than the content they divide.
const PAGE_LINES = ["edge", "divider"] as const;
const PAGE_LINE_FLOOR = 1.1;
const PAGE_LINE_CEILING = 1.35;

describe.each(THEMES)("%s theme contrast", (_theme, selector) => {
  const tokens = parseThemeBlock(tokensCss, selector);

  it.each(PAGE_LINES)("page line %s stays quiet but visible", (line) => {
    const fg = tokens[line];
    expect(fg, `missing token --${line}`).toBeDefined();
    for (const background of ["gray-1", "gray-2"]) {
      const ratio = contrastRatio(fg as string, tokens[background] as string);
      expect(ratio, `--${line} on --${background}`).toBeGreaterThanOrEqual(
        PAGE_LINE_FLOOR,
      );
      expect(ratio, `--${line} on --${background}`).toBeLessThanOrEqual(
        PAGE_LINE_CEILING,
      );
    }
  });

  it("a row divider is lighter than an edge", () => {
    const edge = contrastRatio(
      tokens.edge as string,
      tokens["gray-1"] as string,
    );
    const divider = contrastRatio(
      tokens.divider as string,
      tokens["gray-1"] as string,
    );
    expect(divider).toBeLessThan(edge);
  });

  it.each(PAIRS.map((pair) => [pair.name, pair] as const))(
    "%s",
    (_name, pair) => {
      for (const foreground of pair.foregrounds) {
        for (const background of pair.backgrounds) {
          const fg = tokens[foreground];
          const bg = tokens[background];
          // A renamed or missing token is a regression in itself, not a pass.
          expect(fg, `missing token --${foreground}`).toBeDefined();
          expect(bg, `missing token --${background}`).toBeDefined();
          const ratio = contrastRatio(fg as string, bg as string);
          expect(
            ratio,
            `--${foreground} on --${background}`,
          ).toBeGreaterThanOrEqual(pair.floor);
        }
      }
    },
  );
});
