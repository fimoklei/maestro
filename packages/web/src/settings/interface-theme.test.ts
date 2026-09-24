import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { INTERFACE_THEME_KEY, resolveTheme } from "./interface-theme";

// Stored choice × system preference → the theme stamped on <html>. Nothing
// stored and an unknown value both mean System (#996).
const RESOLUTION_MATRIX: ReadonlyArray<
  [stored: string | null, prefersDark: boolean, theme: "light" | "dark"]
> = [
  ["system", false, "light"],
  ["system", true, "dark"],
  ["light", false, "light"],
  ["light", true, "light"],
  ["dark", false, "dark"],
  ["dark", true, "dark"],
  [null, false, "light"],
  [null, true, "dark"],
  ["purple", false, "light"],
  ["purple", true, "dark"],
];

describe("resolveTheme", () => {
  it.each(RESOLUTION_MATRIX)(
    "resolves stored %s with a dark system preference %s to %s",
    (stored, prefersDark, theme) => {
      expect(resolveTheme(stored, prefersDark)).toBe(theme);
    },
  );
});

// The inline script index.html runs before first paint: the one classic
// (non-module) <script>.
const indexHtml = readFileSync(join(__dirname, "../../index.html"), "utf8");
const inlineScript = /<script>([\s\S]*?)<\/script>/.exec(indexHtml)?.[1] ?? "";

function runInlineScript(
  getItem: (key: string) => string | null,
  prefersDark: boolean,
) {
  const attributes = new Map<string, string>();
  const document = {
    documentElement: {
      setAttribute: (name: string, value: string) =>
        attributes.set(name, value),
    },
  };
  const matchMedia = (query: string) => ({
    matches: query === "(prefers-color-scheme: dark)" && prefersDark,
  });
  new Function("document", "localStorage", "matchMedia", inlineScript)(
    document,
    { getItem },
    matchMedia,
  );
  return attributes.get("data-theme");
}

describe("index.html's inline theme script", () => {
  it.each(RESOLUTION_MATRIX)(
    "stamps stored %s with a dark system preference %s as %s",
    (stored, prefersDark, theme) => {
      const getItem = (key: string) =>
        key === INTERFACE_THEME_KEY ? stored : null;
      expect(runInlineScript(getItem, prefersDark)).toBe(theme);
    },
  );

  it("follows the system when the browser blocks storage", () => {
    const blocked = () => {
      throw new Error("SecurityError");
    };
    expect(runInlineScript(blocked, true)).toBe("dark");
  });
});
