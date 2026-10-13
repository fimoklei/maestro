import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { INTERFACE_THEME_STORAGE_KEY } from "../test-utils";
import { chooseInterfaceTheme, followSystemTheme } from "./interface-theme";

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

describe("followSystemTheme", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const style of document.head.querySelectorAll("style")) style.remove();
    document.documentElement.removeAttribute("data-theme");
    localStorage.removeItem(INTERFACE_THEME_STORAGE_KEY);
  });

  it.each(RESOLUTION_MATRIX)(
    "resolves stored %s with a dark system preference %s to %s",
    (stored, prefersDark, theme) => {
      let follow: (event: { matches: boolean }) => void = () => {};
      vi.stubGlobal("matchMedia", () => ({
        addEventListener: (_: string, listener: typeof follow) => {
          follow = listener;
        },
        removeEventListener: () => {},
      }));
      if (stored !== null) {
        localStorage.setItem(INTERFACE_THEME_STORAGE_KEY, stored);
      }

      const stop = followSystemTheme();
      follow({ matches: prefersDark });
      stop();

      expect(document.documentElement).toHaveAttribute("data-theme", theme);
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
        key === INTERFACE_THEME_STORAGE_KEY ? stored : null;
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

describe("chooseInterfaceTheme", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute("data-theme");
    localStorage.removeItem(INTERFACE_THEME_STORAGE_KEY);
  });

  const transitionMutes = () =>
    [...document.head.querySelectorAll("style")].filter((style) =>
      style.textContent?.includes("transition:none"),
    );

  it("mutes transitions around a switch and restores them two frames later", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (frame: FrameRequestCallback) =>
      frames.push(frame),
    );
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    document.documentElement.setAttribute("data-theme", "light");

    chooseInterfaceTheme("dark");

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(transitionMutes()).toHaveLength(1);
    frames.shift()?.(0);
    expect(transitionMutes()).toHaveLength(1);
    frames.shift()?.(0);
    expect(transitionMutes()).toHaveLength(0);
  });
});
