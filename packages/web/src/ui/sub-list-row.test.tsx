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
    expect(screen.getByText("v0.3.2")).toHaveClass("font-mono");
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
