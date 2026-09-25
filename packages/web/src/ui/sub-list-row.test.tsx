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

  // #1124: as the table's row menu — hidden at rest, shown on hover, focus,
  // while open and where nothing hovers. The browser check measures it.
  it("hides its ⋮ at rest and reveals it on hover, focus or while open", async () => {
    renderRow();

    const trigger = screen.getByRole("button", {
      name: "Actions for …/me/project",
    });
    expect(trigger).toHaveClass(
      "opacity-0",
      "group-hover/sub:opacity-100",
      "group-focus-within/sub:opacity-100",
      "data-[state=open]:opacity-100",
      "[@media(hover:none)]:opacity-100",
    );
    expect(screen.getByRole("listitem")).toHaveClass("group/sub");
    // Still one Tab stop: a pane is not a grid.
    await userEvent.tab();
    await userEvent.tab();
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
