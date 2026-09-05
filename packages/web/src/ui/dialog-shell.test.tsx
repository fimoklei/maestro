import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DialogShell } from "./dialog-shell";

describe("DialogShell", () => {
  it("names the panel with the heading beside it", () => {
    render(
      <DialogShell
        label="Remove tdd"
        describedBy={null}
        width={480}
        onClose={() => {}}
      >
        <h2>Remove tdd</h2>
      </DialogShell>,
    );

    expect(screen.getByRole("dialog", { name: "Remove tdd" })).toHaveAttribute(
      "aria-modal",
      "true",
    );
  });

  it("describes the panel with the element the caller names", () => {
    render(
      <DialogShell
        label="Remove tdd"
        width={480}
        describedBy="lead-in"
        onClose={() => {}}
      >
        <p id="lead-in">Two copies go.</p>
      </DialogShell>,
    );

    expect(screen.getByRole("dialog")).toHaveAttribute(
      "aria-describedby",
      "lead-in",
    );
  });

  // Four of the six dialogs describe nothing; the prop is required, so each
  // one says so rather than omitting it in silence (#752).
  it("leaves the panel undescribed where the caller names no element", () => {
    render(
      <DialogShell
        label="Remove tdd"
        describedBy={null}
        width={480}
        onClose={() => {}}
      >
        <p>body</p>
      </DialogShell>,
    );

    expect(screen.getByRole("dialog")).not.toHaveAttribute("aria-describedby");
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(
      <DialogShell
        label="Remove tdd"
        describedBy={null}
        width={480}
        onClose={onClose}
      >
        <p>body</p>
      </DialogShell>,
    );

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("holds the panel open while closing is disabled", async () => {
    const onClose = vi.fn();
    render(
      <DialogShell
        label="Remove tdd"
        describedBy={null}
        width={480}
        closeEnabled={false}
        onClose={onClose}
      >
        <p>body</p>
      </DialogShell>,
    );

    await userEvent.keyboard("{Escape}");

    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on a click outside the panel", async () => {
    const onClose = vi.fn();
    render(
      <DialogShell
        label="Remove tdd"
        describedBy={null}
        width={480}
        onClose={onClose}
      >
        <p>body</p>
      </DialogShell>,
    );

    const backdrop = document.querySelector("button[aria-hidden='true']");
    if (backdrop === null) throw new Error("no backdrop");
    await userEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("traps Tab inside the panel", async () => {
    render(
      <DialogShell
        label="Remove tdd"
        describedBy={null}
        width={480}
        onClose={() => {}}
      >
        <button type="button">First</button>
        <button type="button">Last</button>
      </DialogShell>,
    );

    await userEvent.tab();
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Last" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
  });

  it("takes the outline the caller computed", () => {
    render(
      <DialogShell
        label="Remove tdd"
        describedBy={null}
        width={480}
        border="border-danger-border"
        onClose={() => {}}
      >
        <p>body</p>
      </DialogShell>,
    );

    expect(screen.getByRole("dialog")).toHaveClass("border-danger-border");
  });
});
