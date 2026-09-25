import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FootActions } from "./foot-actions";

const labels = () =>
  screen
    .getAllByRole("button")
    .map((button) => button.textContent)
    .filter((label) => label !== "");

describe("FootActions", () => {
  it("renders the menu's items as buttons, in the menu's order", () => {
    render(
      <FootActions
        items={[
          { label: "Deploy skill", onSelect: () => {} },
          { label: "Update target", onSelect: () => {} },
          {
            label: "Remove from all 2 targets",
            danger: true,
            onSelect: () => {},
          },
        ]}
      />,
    );

    expect(labels()).toEqual([
      "Deploy skill",
      "Update target",
      "Remove from all 2 targets",
    ]);
  });

  it("moves a danger item last, as the menu does", () => {
    render(
      <FootActions
        items={[
          { label: "Remove skill", danger: true, onSelect: () => {} },
          { label: "Deploy skill", onSelect: () => {} },
        ]}
      />,
    );

    expect(labels()).toEqual(["Deploy skill", "Remove skill"]);
  });

  it("names a control by its label, then what it acts on", () => {
    render(
      <FootActions
        items={[
          {
            label: "Update target",
            name: "Update target Claude Code and Codex",
            onSelect: () => {},
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "Update target Claude Code and Codex",
      }),
    ).toHaveTextContent("Update target");
  });

  // #1065: the first enabled item is the pane's one primary action.
  it("makes the first enabled item primary and keeps danger as danger", () => {
    render(
      <FootActions
        items={[
          {
            label: "Update target — on the latest release",
            disabled: true,
            onSelect: () => {},
          },
          { label: "Deploy skill", onSelect: () => {} },
          { label: "Retry update", onSelect: () => {} },
          { label: "Remove skill", danger: true, onSelect: () => {} },
        ]}
      />,
    );

    const button = (name: string) => screen.getByRole("button", { name });
    expect(button("Deploy skill")).toHaveClass("bg-gray-12");
    expect(button("Retry update")).not.toHaveClass("bg-gray-12");
    expect(button("Remove skill")).toHaveClass("text-red-11");
    expect(button("Update target — on the latest release")).not.toHaveClass(
      "bg-gray-12",
    );
  });

  // #990: outside a row a control is 32px.
  it("sizes every control at the 32px control height", () => {
    render(
      <FootActions
        items={[
          { label: "Deploy skill", onSelect: () => {} },
          { label: "Remove skill", danger: true, onSelect: () => {} },
        ]}
      />,
    );

    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveClass("h-control");
    }
  });

  it("keeps a blocked item focusable, stating why, and never runs it", async () => {
    const onSelect = vi.fn();
    render(
      <FootActions
        items={[
          {
            label: "Update target — on the latest release",
            disabled: true,
            onSelect,
          },
        ]}
      />,
    );

    const button = screen.getByRole("button", {
      name: "Update target — on the latest release",
    });
    expect(button).toHaveAttribute("aria-disabled", "true");
    // Dimmed as a disabled control is, so it never reads as on offer.
    expect(button).toHaveClass(
      "aria-disabled:bg-gray-3",
      "aria-disabled:text-gray-11",
    );
    await userEvent.click(button);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("opens a link item in a new tab, never as a button", () => {
    render(
      <FootActions
        items={[
          {
            label: "View pull request",
            href: "https://github.com/o/r/pull/4",
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("link", { name: /View pull request/ }),
    ).toHaveAttribute("target", "_blank");
    expect(screen.queryByRole("button")).toBeNull();
  });
});
