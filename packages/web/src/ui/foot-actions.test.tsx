import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FootActions, firstEnabled } from "./foot-actions";

const labels = () =>
  screen
    .getAllByRole("button")
    .map((button) => button.textContent)
    .filter((label) => label !== "");

describe("FootActions", () => {
  it("renders the menu's items as buttons, in the menu's order", () => {
    render(
      <FootActions
        primary={null}
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
        primary={null}
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
        primary={null}
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

  it("makes the named item primary and keeps danger as danger", () => {
    render(
      <FootActions
        primary="Import local edits"
        items={[
          { label: "Import local edits", onSelect: () => {} },
          { label: "Deploy skill", onSelect: () => {} },
          { label: "Remove skill", danger: true, onSelect: () => {} },
        ]}
      />,
    );

    const button = (name: string) => screen.getByRole("button", { name });
    expect(button("Import local edits")).toHaveClass("bg-gray-12");
    expect(button("Deploy skill")).not.toHaveClass("bg-gray-12");
    expect(button("Remove skill")).toHaveClass("text-red-11");
  });

  it("makes nothing primary when no item is named", () => {
    render(
      <FootActions
        primary={null}
        items={[{ label: "Deploy skill", onSelect: () => {} }]}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Deploy skill" }),
    ).not.toHaveClass("bg-gray-12");
  });

  // #1065: where the order already puts the next step first.
  it("names the first enabled, non-danger action as firstEnabled", () => {
    expect(
      firstEnabled([
        { label: "View pull request", href: "https://github.com/o/r/pull/4" },
        { label: "Propose change", disabled: true, onSelect: () => {} },
        { label: "Delete skill", danger: true, onSelect: () => {} },
        { label: "Deploy skill", onSelect: () => {} },
      ]),
    ).toBe("Deploy skill");
    expect(
      firstEnabled([
        { label: "Remove skill", danger: true, onSelect: () => {} },
      ]),
    ).toBeNull();
  });

  // #990: outside a row a control is 32px.
  it("sizes every control at the 32px control height", () => {
    render(
      <FootActions
        primary={null}
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
        primary={null}
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
        primary={null}
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
