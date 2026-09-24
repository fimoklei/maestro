import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppearancePage } from "./appearance-page";
import { INTERFACE_THEME_KEY } from "./interface-theme";

// The system preference, fixed per test.
function prefersDark(dark: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(prefers-color-scheme: dark)" && dark,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  prefersDark(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AppearancePage", () => {
  it("shows the Interface theme row under the Theme section", () => {
    render(<AppearancePage />);

    const section = screen.getByRole("region", { name: "Theme" });
    expect(
      within(section).getByRole("heading", { level: 2, name: "Theme" }),
    ).toBeInTheDocument();
    expect(within(section).getByText("Interface theme")).toBeInTheDocument();
    expect(
      within(section).getByText(
        "Select System to follow your operating system.",
      ),
    ).toBeInTheDocument();
  });

  it("shows System when nothing is stored", () => {
    render(<AppearancePage />);

    expect(
      screen.getByRole("combobox", { name: "Interface theme" }),
    ).toHaveTextContent("System");
  });

  it("shows the stored choice", () => {
    localStorage.setItem(INTERFACE_THEME_KEY, "dark");
    render(<AppearancePage />);

    expect(
      screen.getByRole("combobox", { name: "Interface theme" }),
    ).toHaveTextContent("Dark");
  });

  it("applies a choice at once and stores it", async () => {
    prefersDark(true);
    render(<AppearancePage />);
    const select = screen.getByRole("combobox", { name: "Interface theme" });

    select.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.click(await screen.findByRole("option", { name: "Light" }));

    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(localStorage.getItem(INTERFACE_THEME_KEY)).toBe("light");
    expect(select).toHaveTextContent("Light");
  });

  it("returns to the system theme when System is chosen", async () => {
    prefersDark(true);
    localStorage.setItem(INTERFACE_THEME_KEY, "light");
    document.documentElement.setAttribute("data-theme", "light");
    render(<AppearancePage />);

    screen.getByRole("combobox", { name: "Interface theme" }).focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.click(
      await screen.findByRole("option", { name: "System" }),
    );

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(localStorage.getItem(INTERFACE_THEME_KEY)).toBe("system");
  });
});
