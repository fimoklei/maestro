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
});
