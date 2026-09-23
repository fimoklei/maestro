import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ActionsMenu } from "./actions-menu";

describe("ActionsMenu", () => {
  it("renders a trigger that names itself for assistive tech", () => {
    render(
      <ActionsMenu
        label="Actions for tdd"
        items={[{ label: "remove…", onSelect: () => {} }]}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Actions for tdd" }),
    ).toBeInTheDocument();
  });

  it("opens from the keyboard and exposes every item as a menu item", async () => {
    render(
      <ActionsMenu
        label="Actions for tdd"
        items={[
          { label: "remove…", onSelect: () => {} },
          { label: "copy ref", onSelect: () => {} },
        ]}
      />,
    );

    await userEvent.tab();
    await userEvent.keyboard("{Enter}");

    expect(
      await screen.findByRole("menuitem", { name: "remove…" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "copy ref" }),
    ).toBeInTheDocument();
  });

  it("runs an item's action when it is chosen with the keyboard", async () => {
    const onSelect = vi.fn();
    render(
      <ActionsMenu
        label="Actions for tdd"
        items={[{ label: "remove…", onSelect }]}
      />,
    );

    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("menuitem", { name: "remove…" });
    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape and puts focus back on the trigger", async () => {
    render(
      <ActionsMenu
        label="Actions for tdd"
        items={[{ label: "remove…", onSelect: () => {} }]}
      />,
    );

    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("menuitem", { name: "remove…" });

    await userEvent.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: "Actions for tdd" }),
    ).toHaveFocus();
  });

  it("offers no menu to open when there is nothing to act on", () => {
    render(<ActionsMenu label="Actions for tdd" items={[]} />);

    expect(
      screen.getByRole("button", { name: "Actions for tdd" }),
    ).toBeDisabled();
  });

  it("leaves focus where a chosen item put it", async () => {
    // An item that opens a pane and focuses a field there keeps that focus.
    function Opener() {
      return (
        <>
          <ActionsMenu
            label="Actions for tdd"
            items={[
              {
                label: "Deploy skill",
                onSelect: () =>
                  document.getElementById("target-picker")?.focus(),
              },
            ]}
            returnFocus={false}
          />
          <select id="target-picker" aria-label="Deploy target" />
        </>
      );
    }
    render(<Opener />);

    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("menuitem", { name: "Deploy skill" });
    await userEvent.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("combobox", { name: "Deploy target" }),
    ).toHaveFocus();
  });

  it("sets a destructive item apart, behind its own separator", async () => {
    render(
      <ActionsMenu
        label="Actions for tdd"
        items={[
          { label: "Propose change", onSelect: () => {} },
          { label: "Delete skill", onSelect: () => {}, danger: true },
        ]}
      />,
    );

    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("menuitem", { name: "Delete skill" });

    const menu = screen.getByRole("menu");
    const children = [...menu.children].map(
      (child) => child.getAttribute("role") ?? "",
    );
    expect(children).toEqual(["menuitem", "separator", "menuitem"]);
  });

  it("sets the links apart from the actions, behind a separator", async () => {
    render(
      <ActionsMenu
        label="Actions for tdd"
        items={[
          { label: "Update proposal", onSelect: () => {} },
          { label: "View pull request", href: "https://github.com/o/r/pull/1" },
        ]}
      />,
    );

    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("menuitem", { name: "Update proposal" });

    const children = [...screen.getByRole("menu").children].map(
      (child) => child.getAttribute("role") ?? "",
    );
    expect(children).toEqual(["menuitem", "separator", "menuitem"]);
  });
});
