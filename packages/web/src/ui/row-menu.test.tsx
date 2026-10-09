import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RowMenu } from "./row-menu";

const renderMenu = ({
  movesFocus,
  tabStop,
  onSelect = () => {},
}: {
  movesFocus: boolean;
  tabStop: boolean;
  onSelect?: () => void;
}) =>
  render(
    <div className="group/row">
      <button type="button">Before</button>
      <RowMenu
        label="Actions for tdd"
        items={[{ label: "Update target", onSelect, movesFocus }]}
        tabStop={tabStop}
        busy={false}
      />
    </div>,
  );

const trigger = () => screen.getByRole("button", { name: "Actions for tdd" });

const pick = async (item: string) => {
  await userEvent.click(trigger());
  await userEvent.click(await screen.findByRole("menuitem", { name: item }));
};

describe("RowMenu", () => {
  it("runs the picked item", async () => {
    const onSelect = vi.fn();
    renderMenu({ movesFocus: false, tabStop: true, onSelect });

    await pick("Update target");

    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("stays out of the Tab order inside a grid", async () => {
    renderMenu({ movesFocus: true, tabStop: false });

    await userEvent.tab();
    await userEvent.tab();

    expect(trigger()).not.toHaveFocus();
  });

  it("is a Tab stop outside a grid", async () => {
    renderMenu({ movesFocus: false, tabStop: true });

    await userEvent.tab();
    await userEvent.tab();

    expect(trigger()).toHaveFocus();
  });

  it("returns focus to ⋮ after an item that does not move it", async () => {
    renderMenu({ movesFocus: false, tabStop: true });

    await pick("Update target");

    expect(trigger()).toHaveFocus();
  });

  it("leaves focus to an item that moves it on", async () => {
    renderMenu({ movesFocus: true, tabStop: false });

    await pick("Update target");

    expect(trigger()).not.toHaveFocus();
  });

  // One visibility mode for table and sub-list rows: hidden at rest, shown on
  // hover, on the active row, while open and where nothing hovers. The
  // browser check measures it; happy-dom renders no CSS.
  it("reveals ⋮ on hover or the active row only", () => {
    renderMenu({ movesFocus: false, tabStop: true });

    expect(trigger()).toHaveClass(
      "opacity-0",
      "group-hover/row:opacity-100",
      "group-data-[active]/row:opacity-100",
      "group-focus-within/row:opacity-100",
      "data-[state=open]:opacity-100",
      "[@media(hover:none)]:opacity-100",
    );
  });
});
