import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// WCAG 2.2 AA floor for the shipped text ramp. PRODUCT.md commits to 4.5:1 for
// meaning-carrying text; issue #209 measured --text-dim below it on nine
// enabled controls. This guards the whole ramp against silent regression: every
// text step must clear 4.5:1 on every surface it can render on, in the theme
// that actually ships (the first token block — :root / [data-theme="dark"]).

const AA = 4.5;

const surfaceTokens = [
  "bg-0",
  "bg-1",
  "surface-card",
  "surface-inset",
  "surface-active",
] as const;

const textTokens = [
  "text-1",
  "text-2",
  "text-3",
  "text-muted",
  "text-dim",
] as const;

function parseShippedTokens(css: string): Record<string, string> {
  // The shipped theme is the first token block. tokens.css declares no nested
  // braces inside a block, so the first "}" closes it.
  const block = css.slice(css.indexOf("{") + 1, css.indexOf("}"));
  const tokens: Record<string, string> = {};
  for (const match of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    const [, name, hex] = match;
    if (name && hex) {
      tokens[name] = hex;
    }
  }
  return tokens;
}

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

// Vitest runs this project from either the repo root or packages/web depending
// on how it is invoked, so resolve tokens.css from whichever cwd applies.
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

describe("shipped text ramp contrast", () => {
  const tokens = parseShippedTokens(tokensCss);

  const pairs = textTokens.flatMap((text) =>
    surfaceTokens.map((surface) => [text, surface] as const),
  );

  it.each(pairs)("%s clears WCAG AA on %s", (textToken, surfaceToken) => {
    const text = tokens[textToken];
    const surface = tokens[surfaceToken];
    // A renamed or missing token is a regression in itself, not a pass.
    expect(text, `missing token --${textToken}`).toBeDefined();
    expect(surface, `missing token --${surfaceToken}`).toBeDefined();
    const ratio = contrastRatio(text as string, surface as string);
    expect(ratio).toBeGreaterThanOrEqual(AA);
  });
});
