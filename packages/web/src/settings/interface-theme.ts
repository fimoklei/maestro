// The Interface theme (#996, ADR-0033 §5): the reader's choice, stored per
// browser, and the theme it resolves to. index.html's inline script resolves
// the same way before first paint; interface-theme.test.ts runs both.

export type InterfaceTheme = "system" | "light" | "dark";
export type Theme = "light" | "dark";

/** The localStorage key; index.html's inline script reads the same one. */
export const INTERFACE_THEME_KEY = "maestro.interface-theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Unknown or nothing stored is System. */
export function parseInterfaceTheme(stored: string | null): InterfaceTheme {
  return stored === "light" || stored === "dark" ? stored : "system";
}

export function resolveTheme(
  stored: string | null,
  prefersDark: boolean,
): Theme {
  const choice = parseInterfaceTheme(stored);
  if (choice !== "system") return choice;
  return prefersDark ? "dark" : "light";
}

// Storage can throw where the browser blocks site data; the theme then follows
// the system for this visit.
function readStored(): string | null {
  try {
    return localStorage.getItem(INTERFACE_THEME_KEY);
  } catch {
    return null;
  }
}

export function readInterfaceTheme(): InterfaceTheme {
  return parseInterfaceTheme(readStored());
}

/** Stores the choice and applies it at once. */
export function chooseInterfaceTheme(choice: InterfaceTheme) {
  try {
    localStorage.setItem(INTERFACE_THEME_KEY, choice);
  } catch {
    // Applied for this visit only.
  }
  applyTheme(resolveTheme(choice, matchMedia(DARK_QUERY).matches));
}

// Transitions are muted for the frames around a switch, so every component
// changes together instead of fading at its own pace (#996).
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (root.getAttribute("data-theme") === theme) return;
  const mute = document.createElement("style");
  mute.textContent = "*,*::before,*::after{transition:none!important}";
  document.head.append(mute);
  root.setAttribute("data-theme", theme);
  // Forces the restyle while the mute still holds.
  void getComputedStyle(root).colorScheme;
  requestAnimationFrame(() => requestAnimationFrame(() => mute.remove()));
}

/**
 * Follows a change of the system setting while the choice is System; a pinned
 * choice resolves to itself, so nothing changes. Returns the unsubscribe.
 */
export function followSystemTheme(): () => void {
  const media = matchMedia(DARK_QUERY);
  const follow = (event: MediaQueryListEvent) =>
    applyTheme(resolveTheme(readStored(), event.matches));
  media.addEventListener("change", follow);
  return () => media.removeEventListener("change", follow);
}
