import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  CLEAR_SELECTION,
  hiddenByFilterLine,
  SelectionBar,
  selectedCount,
} from "./selection-bar";

describe("SelectionBar", () => {
  it("is named by its count and carries the actions on the selection", () => {
    render(
      <SelectionBar count={3} onClear={() => {}}>
        <button type="button">Deploy skills</button>
      </SelectionBar>,
    );

    const bar = screen.getByRole("group", { name: "3 selected" });
    expect(bar).toContainElement(
      screen.getByRole("button", { name: "Deploy skills" }),
    );
    expect(bar).not.toHaveTextContent(/hidden/);
  });

  it("says how many chosen rows the filter keeps off screen", () => {
    render(
      <SelectionBar count={3} hiddenCount={1} onClear={() => {}}>
        {null}
      </SelectionBar>,
    );

    expect(screen.getByRole("group")).toHaveTextContent(
      "· 1 hidden by the filter",
    );
  });

  it("clears the selection", async () => {
    const onClear = vi.fn();
    render(
      <SelectionBar count={1} onClear={onClear}>
        {null}
      </SelectionBar>,
    );

    await userEvent.click(
      screen.getByRole("button", { name: CLEAR_SELECTION }),
    );
    expect(onClear).toHaveBeenCalledOnce();
  });
});

// Approved words, as exact strings.
describe("SelectionBar copy", () => {
  it("counts the selection and what the filter hides", () => {
    expect(selectedCount(3)).toBe("3 selected");
    expect(hiddenByFilterLine(1)).toBe("· 1 hidden by the filter");
    expect(CLEAR_SELECTION).toBe("Clear selection");
  });
});
