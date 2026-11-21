import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  expectDescription,
  fakeTimeouts,
  hoverOpen,
  passTime,
  shownCard,
} from "../test-utils";
import { reading } from "./status-reading";
import { SubListRow } from "./sub-list-row";
import { useDismiss } from "./use-dismiss";

const renderRow = (onSelect = () => {}) =>
  render(
    <ul>
      <SubListRow
        mark={{ ...reading("Behind", "attention"), hint: "A newer release" }}
        name="…/me/project"
        value={{ text: "v0.3.2", machine: true }}
        menuLabel="Actions for …/me/project"
        items={[{ label: "Update target", onSelect }]}
      />
    </ul>,
  );

const LONG = "v0.4.1 → v0.4.3";

/** A row with no items, so only its mark and value matter. */
const renderMarkRow = (mark: Parameters<typeof SubListRow>[0]["mark"]) =>
  render(
    <ul>
      <SubListRow
        mark={mark}
        name="improve-codebase-architecture"
        value={{ text: LONG, machine: true }}
        menuLabel="Actions for improve-codebase-architecture"
        items={[]}
      />
    </ul>,
  );

function Pane({ onClose }: { onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useDismiss({ containerRef, onClose });
  return (
    <div ref={containerRef}>
      <ul>
        <SubListRow
          mark={{ ...reading("Behind", "attention"), hint: "A newer release" }}
          name="tdd"
          value={{ text: "v0.3.2", machine: true }}
          menuLabel="Actions for tdd"
          items={[]}
        />
      </ul>
    </div>
  );
}

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

  // #1837: a long name shortens the value with an ellipsis; the card keeps it
  // whole, beside the reading and before the reading's own line.
  it("opens a card with the reading, the whole value and its own line on keyboard focus", async () => {
    renderMarkRow({
      ...reading("Local edits", "attention"),
      hint: "Edited here.",
    });

    await userEvent.tab();

    expect(await shownCard()).toHaveTextContent(
      /^Local edits\s*v0\.4\.1 → v0\.4\.3\s*Edited here\.$/,
    );
  });

  it("opens the card on hover, holding the whole value where the reading has no line of its own", async () => {
    renderMarkRow(reading("Behind", "attention"));

    await hoverOpen(screen.getByRole("img", { name: "Behind" }));

    expect(await shownCard()).toHaveTextContent(
      /^Behind\s*v0\.4\.1 → v0\.4\.3$/,
    );
  });

  it("describes the mark with the reading's own line where it has one", () => {
    renderRow();

    expectDescription(
      screen.getByRole("img", { name: "Behind" }),
      "A newer release",
    );
  });

  it("describes the mark with the whole value where the reading has no line of its own", () => {
    renderMarkRow(reading("Behind", "attention"));

    expectDescription(screen.getByRole("img", { name: "Behind" }), LONG);
  });

  it("closes the card on Escape without closing the pane it sits in", async () => {
    const onClose = vi.fn();
    render(<Pane onClose={onClose} />);

    await userEvent.tab();
    expect(await screen.findByText("A newer release")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByText("A newer release")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps the card closed after an Escape pressed before the hover delay ends", async () => {
    fakeTimeouts();
    try {
      renderRow();

      await userEvent.tab();
      expect(screen.getByText("A newer release")).toBeInTheDocument();
      await userEvent.keyboard("{Escape}");
      passTime(400);

      expect(screen.queryByText("A newer release")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves the mark's slot empty while the reading is unknown yet", () => {
    renderMarkRow(null);

    expect(screen.queryByRole("img")).toBeNull();
  });
});
