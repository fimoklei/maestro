import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { FootActions, firstEnabled } from "./foot-actions";

const labels = () =>
  screen
    .getAllByRole("button")
    .map((button) => button.textContent)
    .filter((label) => label !== "");

describe("FootActions", () => {
  // #1485, #1744: the foot fits one line in the 360px pane.
  it("shows the primary and the edit item; the rest sit behind the ⋯ in ⋮ order, danger last", async () => {
    render(
      <FootActions
        name="pr-review"
        primary="Copy prompt"
        items={[
          { label: "Copy prompt", onSelect: () => {} },
          { label: "Edit prompt", edit: true, onSelect: () => {} },
          { label: "Delete prompt", danger: true, onSelect: () => {} },
          { label: "Set category", onSelect: () => {} },
        ]}
      />,
    );

    expect(labels()).toEqual(["Copy prompt", "Edit prompt", "⋯"]);
    const trigger = screen.getByRole("button", {
      name: "Actions for pr-review",
    });
    expect(trigger).toHaveClass("h-8", "w-8", "ml-auto");
    await userEvent.click(trigger);
    const menu = screen.getByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["Set category", "Delete prompt"]);
    expect(within(menu).getAllByRole("separator")).toHaveLength(1);
  });

  it("shows no primary button where none is named: the edit item, then the ⋯", () => {
    render(
      <FootActions
        name="pr-review"
        primary={null}
        items={[
          { label: "Copy prompt", onSelect: () => {} },
          { label: "Edit prompt", edit: true, onSelect: () => {} },
        ]}
      />,
    );

    expect(labels()).toEqual(["Edit prompt", "⋯"]);
  });

  it("shows only the ⋯ without a primary or an edit item", () => {
    render(
      <FootActions
        name="tdd"
        primary={null}
        items={[
          { label: "Deploy skill", onSelect: () => {} },
          { label: "Delete skill", danger: true, onSelect: () => {} },
        ]}
      />,
    );

    expect(labels()).toEqual(["⋯"]);
  });

  it("shows no ⋯ when nothing is left over", () => {
    render(
      <FootActions
        name="tdd"
        primary="Deploy skill"
        items={[{ label: "Deploy skill", onSelect: () => {} }]}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Actions for tdd" }),
    ).toBeNull();
  });

  // #1689: a menu item shows no cause, so a blocked item with one stays out.
  it("keeps a blocked item with a cause in the foot, its cause in the tooltip", async () => {
    const cause =
      "Merge pull request #52 on GitHub, or select Withdraw proposal.";
    render(
      <FootActions
        name="tdd"
        primary={null}
        items={[
          {
            label: "View pull request",
            href: "https://github.com/o/r/pull/52",
          },
          {
            label: "Withdraw from release",
            danger: true,
            disabled: true,
            cause,
          },
        ]}
      />,
    );

    expect(labels()).toEqual(["Withdraw from release", "⋯"]);
    const button = screen.getByRole("button", {
      name: "Withdraw from release",
    });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription(cause);
  });

  it("keeps an item whose write runs a button with its busy label", () => {
    render(
      <FootActions
        name="tdd"
        primary={null}
        items={[
          { label: "Propose change", busy: "propose", disabled: true },
          { label: "Discard change", danger: true, disabled: true },
        ]}
      />,
    );

    expect(labels()).toEqual(["Proposing…", "⋯"]);
  });

  // Set category opens its menu above the foot; closing it returns focus here.
  it("points a ⋯ item's button ref at the ⋯", () => {
    const buttonRef = createRef<HTMLButtonElement>();
    render(
      <FootActions
        name="tdd"
        primary="Deploy skill"
        items={[
          { label: "Deploy skill", onSelect: () => {} },
          { label: "Set category", buttonRef, onSelect: () => {} },
        ]}
      />,
    );

    expect(buttonRef.current).toBe(
      screen.getByRole("button", { name: "Actions for tdd" }),
    );
  });

  it("keeps a blocked danger item focusable in the menu and never runs it", async () => {
    const onSelect = vi.fn();
    render(
      <FootActions
        name="tdd"
        primary={null}
        items={[
          { label: "Delete skill", danger: true, disabled: true, onSelect },
        ]}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Actions for tdd" }),
    );
    const item = screen.getByRole("menuitem", { name: "Delete skill" });
    expect(item).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(item);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("names a control by its label, then what it acts on", () => {
    render(
      <FootActions
        name="tdd"
        primary="Update target"
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

  it("makes the named item primary", () => {
    render(
      <FootActions
        name="tdd"
        primary="Copy prompt"
        items={[
          { label: "Copy prompt", onSelect: () => {} },
          { label: "Edit prompt", edit: true, onSelect: () => {} },
        ]}
      />,
    );

    const button = (name: string) => screen.getByRole("button", { name });
    expect(button("Copy prompt")).toHaveClass("bg-gray-12");
    expect(button("Edit prompt")).not.toHaveClass("bg-gray-12");
  });

  it("makes nothing primary when no item is named", () => {
    render(
      <FootActions
        name="tdd"
        primary={null}
        items={[{ label: "Edit prompt", edit: true, onSelect: () => {} }]}
      />,
    );

    expect(screen.getByRole("button", { name: "Edit prompt" })).not.toHaveClass(
      "bg-gray-12",
    );
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
        name="tdd"
        primary="Copy prompt"
        items={[
          { label: "Copy prompt", onSelect: () => {} },
          { label: "Edit prompt", edit: true, onSelect: () => {} },
          { label: "Delete prompt", danger: true, onSelect: () => {} },
        ]}
      />,
    );

    const [copy, edit, more] = screen.getAllByRole("button");
    expect(copy).toHaveClass("h-control");
    expect(edit).toHaveClass("h-control");
    expect(more).toHaveClass("h-8", "w-8");
  });

  it("keeps a blocked item focusable, stating why, and never runs it", async () => {
    const onSelect = vi.fn();
    render(
      <FootActions
        name="tdd"
        primary={null}
        items={[{ label: "Edit prompt", edit: true, disabled: true, onSelect }]}
      />,
    );

    const button = screen.getByRole("button", { name: "Edit prompt" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    // Dimmed as a disabled control is, so it never reads as on offer.
    expect(button).toHaveClass(
      "aria-disabled:bg-gray-3",
      "aria-disabled:text-gray-11",
    );
    await userEvent.click(button);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("opens a link item from the ⋯ in a new tab", async () => {
    render(
      <FootActions
        name="tdd"
        primary={null}
        items={[
          {
            label: "View pull request",
            href: "https://github.com/o/r/pull/4",
          },
        ]}
      />,
    );

    expect(labels()).toEqual(["⋯"]);
    await userEvent.click(
      screen.getByRole("button", { name: "Actions for tdd" }),
    );
    expect(
      screen.getByRole("menuitem", { name: "View pull request" }),
    ).toHaveAttribute("target", "_blank");
  });
});
