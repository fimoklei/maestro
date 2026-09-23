import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SettingsNarrowBar } from "./settings-narrow-bar";
import { SETTINGS_PAGES } from "./settings-pages";

function renderBar() {
  const onNavigate = vi.fn();
  const onBack = vi.fn();
  render(
    <SettingsNarrowBar
      pages={SETTINGS_PAGES}
      onNavigate={onNavigate}
      onBack={onBack}
    />,
  );
  return { onNavigate, onBack };
}

describe("SettingsNarrowBar", () => {
  it("leaves Settings with Back to app", async () => {
    const { onBack } = renderBar();

    await userEvent.click(screen.getByRole("button", { name: "Back to app" }));

    expect(onBack).toHaveBeenCalledOnce();
  });

  it("carries every page the sidebar lists in its menu", async () => {
    const { onNavigate } = renderBar();

    await userEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Harness location", "Appearance"]);
    await userEvent.click(screen.getByRole("menuitem", { name: "Appearance" }));

    expect(onNavigate).toHaveBeenCalledWith("/settings/appearance");
  });
});
