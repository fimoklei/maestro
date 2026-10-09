import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { reading } from "./status-reading";
import { SubListRow } from "./sub-list-row";

const renderRow = (onSelect = () => {}) =>
  render(
    <ul>
      <SubListRow
        mark={{ ...reading("Behind", "attention"), hint: "A newer release" }}
        name="…/me/project"
        value="v0.3.2"
        menuLabel="Actions for …/me/project"
        items={[{ label: "Update target", onSelect }]}
      />
    </ul>,
  );

// #1065: mark · name · machine value · ⋮, the one row form in every pane.
describe("SubListRow", () => {
  it("leads with a mark named by its reading, then the name and its value", () => {
    renderRow();

    const row = screen.getByRole("listitem");
    const mark = screen.getByRole("img", { name: "Behind" });
    expect(row.firstElementChild).toContainElement(mark);
    expect(screen.getByText("…/me/project")).toBeInTheDocument();
    expect(screen.getByText("v0.3.2")).toBeInTheDocument();
  });

  it("carries the row's actions behind its ⋮ menu", async () => {
    const onSelect = vi.fn();
    renderRow(onSelect);

    await userEvent.click(
      screen.getByRole("button", { name: "Actions for …/me/project" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Update target" }),
    );
    expect(onSelect).toHaveBeenCalledOnce();
  });

  // #1449: a pane is not a grid, so the keyboard reaches ⋮ by Tab, after the
  // mark. Its hover reveal is styling, which the browser check measures.
  it("keeps ⋮ a Tab stop after the mark", async () => {
    renderRow();

    await userEvent.tab();
    expect(screen.getByRole("img", { name: "Behind" })).toHaveFocus();
    await userEvent.tab();
    expect(
      screen.getByRole("button", { name: "Actions for …/me/project" }),
    ).toHaveFocus();
  });

  it("returns focus to ⋮ once an item has run", async () => {
    renderRow();

    const trigger = screen.getByRole("button", {
      name: "Actions for …/me/project",
    });
    await userEvent.click(trigger);
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Update target" }),
    );
    expect(trigger).toHaveFocus();
  });

  it("leaves the mark's slot empty while the reading is unknown yet", () => {
    render(
      <ul>
        <SubListRow
          mark={null}
          name="tdd"
          value="v0.3.2"
          menuLabel="Actions for tdd"
          items={[]}
        />
      </ul>,
    );

    expect(screen.queryByRole("img")).toBeNull();
  });
});
