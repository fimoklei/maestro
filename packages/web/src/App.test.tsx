import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { INTERFACE_THEME_KEY } from "./settings/interface-theme";
import { jsonResponse, renderWithQuery } from "./test-utils";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

// A system preference the test can flip, as the operating system would.
function systemTheme(dark: boolean) {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  vi.stubGlobal("matchMedia", () => ({
    matches: dark,
    addEventListener: (
      _: string,
      listener: (event: { matches: boolean }) => void,
    ) => listeners.add(listener),
    removeEventListener: (
      _: string,
      listener: (event: { matches: boolean }) => void,
    ) => listeners.delete(listener),
  }));
  return (next: boolean) => {
    dark = next;
    for (const listener of listeners) listener({ matches: next });
  };
}

function stubEmptyReads() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      jsonResponse(
        { ok: true, repos: [], primitives: [], skipped: [], behind: [] },
        200,
      ),
    ),
  );
}

function renderApp() {
  return renderWithQuery(<App />);
}

describe("App", () => {
  it("renders the cockpit shell and lands on Deploy-state", async () => {
    stubEmptyReads();
    renderApp();

    // The frame stands — sidebar plus the landing screen's own panel (#991).
    expect(
      await screen.findByRole("complementary", { name: "Navigation" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Deploy-state" }),
    ).toBeInTheDocument();
  });

  it("follows a change of the system theme while on System", async () => {
    stubEmptyReads();
    const flip = systemTheme(false);
    document.documentElement.setAttribute("data-theme", "light");
    renderApp();
    await screen.findByRole("complementary", { name: "Navigation" });

    flip(true);

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });

  it("keeps a pinned theme when the system theme changes", async () => {
    stubEmptyReads();
    localStorage.setItem(INTERFACE_THEME_KEY, "light");
    const flip = systemTheme(false);
    document.documentElement.setAttribute("data-theme", "light");
    renderApp();
    await screen.findByRole("complementary", { name: "Navigation" });

    flip(true);

    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });
});
