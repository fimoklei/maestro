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

  // #1124: a pane's slot carries z-20, so an unlayered menu opened behind it.
  // happy-dom paints nothing; the browser measurement is in the commit.
  it("opens on the floating layer, above a detail pane", async () => {
    render(
      <ActionsMenu
        label="Actions for tdd"
        items={[{ label: "remove…", onSelect: () => {} }]}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Actions for tdd" }),
    );

    expect(await screen.findByRole("menu")).toHaveClass("z-50");
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

  // design.md (Keyboard): an unavailable control stays focusable and says why.
  it("keeps a disabled item focusable, marked, and inert when chosen", async () => {
    const onSelect = vi.fn();
    render(
      <ActionsMenu
        label="Actions for tdd"
        items={[
          {
            label: "Retry update — nothing to retry",
            onSelect,
            disabled: true,
          },
          { label: "copy ref", onSelect: () => {} },
        ]}
      />,
    );

    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    const blocked = await screen.findByRole("menuitem", {
      name: "Retry update — nothing to retry",
    });
    await waitFor(() => expect(blocked).toHaveFocus());
    expect(blocked).toHaveAttribute("aria-disabled", "true");
    await userEvent.keyboard("{Enter}");
    await userEvent.click(blocked);

    expect(onSelect).not.toHaveBeenCalled();
    expect(blocked).toBeInTheDocument();
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

  it("sets a destructive item apart behind a divider, last", async () => {
    render(
      <ActionsMenu
        label="Actions for old-site"
        items={[
          { label: "Unregister", onSelect: () => {}, danger: true },
          { label: "View Deploy-state", onSelect: () => {} },
        ]}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Actions for old-site" }),
    );

    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "View Deploy-state",
      "Unregister",
    ]);
    expect(screen.getAllByRole("separator")).toHaveLength(1);
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

  it("draws no divider in a menu without a destructive item", async () => {
    render(
      <ActionsMenu
        label="Actions for tdd"
        items={[{ label: "copy ref", onSelect: () => {} }]}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Actions for tdd" }),
    );

    await screen.findByRole("menuitem", { name: "copy ref" });
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });
});
