import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SETTINGS_PAGES } from "./settings-pages";
import { SettingsSidebar } from "./settings-sidebar";

function renderSidebar(active = "/settings/harness-location") {
  const onNavigate = vi.fn();
  const onBack = vi.fn();
  render(
    <SettingsSidebar
      pages={SETTINGS_PAGES}
      active={active}
      onNavigate={onNavigate}
      onBack={onBack}
    />,
  );
  return { onNavigate, onBack };
}

describe("SettingsSidebar", () => {
  it("lists the pages under Personal, Harness location first", () => {
    renderSidebar();

    expect(screen.getByText("Personal")).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Personal" });
    expect(
      within(nav)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Harness location", "Appearance"]);
  });

  it("marks the open page, and only that one, as the current page", () => {
    renderSidebar("/settings/appearance");

    expect(screen.getByRole("button", { name: "Appearance" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("button", { name: "Harness location" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("opens a page by its path", async () => {
    const { onNavigate } = renderSidebar();

    await userEvent.click(screen.getByRole("button", { name: "Appearance" }));

    expect(onNavigate).toHaveBeenCalledWith("/settings/appearance");
  });

  it("leaves Settings with Back to app", async () => {
    const { onBack } = renderSidebar();

    await userEvent.click(screen.getByRole("button", { name: "Back to app" }));

    expect(onBack).toHaveBeenCalledOnce();
  });

  it("names its landmark so it is distinct from the cockpit's sidebar", () => {
    renderSidebar();

    expect(
      screen.getByRole("complementary", { name: "Settings" }),
    ).toBeInTheDocument();
  });
});
