import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DialogShell } from "./dialog-shell";

// Radix dismisses on pointerdown, and takes pointer events off the page behind
// a modal — so the click outside is raised as the event the layer listens for.
const clickOutside = async () => {
  // Radix registers its outside listener on the next tick, so the click is
  // raised after one.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  fireEvent.pointerDown(document.body);
  fireEvent.click(document.body);
};

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

  // A dialog that closes by sending the reader on (View in Harness opens a
  // pane that takes focus) must not pull focus back to the opener (#1045).
  describe("on close", () => {
    function Host() {
      const [open, setOpen] = useState(false);
      const [landed, setLanded] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Opener
          </button>
          {landed ? <Landing /> : null}
          {open ? (
            <DialogShell
              label="Import a skill"
              describedBy={null}
              width={480}
              onClose={() => setOpen(false)}
            >
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setLanded(true);
                }}
              >
                View in Harness
              </button>
            </DialogShell>
          ) : null}
        </>
      );
    }
    function Landing() {
      const ref = useRef<HTMLHeadingElement>(null);
      useEffect(() => ref.current?.focus(), []);
      return (
        <h2 ref={ref} tabIndex={-1}>
          code-review
        </h2>
      );
    }

    it("returns focus to the control that opened it", async () => {
      render(<Host />);
      await userEvent.click(screen.getByRole("button", { name: "Opener" }));

      await userEvent.keyboard("{Escape}");

      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Opener" })).toHaveFocus(),
      );
    });

    it("leaves focus where the close sent it", async () => {
      render(<Host />);
      await userEvent.click(screen.getByRole("button", { name: "Opener" }));

      await userEvent.click(
        screen.getByRole("button", { name: "View in Harness" }),
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(
        screen.getByRole("heading", { name: "code-review" }),
      ).toHaveFocus();
    });
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

    await clickOutside();

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

  // A destructive dialog opens on Cancel, so Enter never deletes (ADR-0033 §6).
  describe("where focus opens", () => {
    it("lands on Cancel in a destructive dialog", async () => {
      render(
        <DialogShell
          label="Remove tdd"
          describedBy={null}
          width={480}
          destructive
          onClose={() => {}}
        >
          <button type="button" data-dialog-cancel="">
            Cancel
          </button>
          <button type="button">Remove skill</button>
        </DialogShell>,
      );

      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus(),
      );
    });

    it("leaves focus on the panel where nothing is destructive", async () => {
      render(
        <DialogShell
          label="Update maestro"
          describedBy={null}
          width={480}
          onClose={() => {}}
        >
          <button type="button" data-dialog-cancel="">
            Cancel
          </button>
          <button type="button">Update target</button>
        </DialogShell>,
      );

      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Cancel" }),
        ).not.toHaveFocus(),
      );
    });
  });

  // "Ignore a click outside once a field has changed" (ADR-0033 §6): typed
  // work is never thrown away by a stray click, while Escape and Cancel stay.
  describe("a click outside once a field has changed", () => {
    it("does nothing", async () => {
      const onClose = vi.fn();
      render(
        <DialogShell
          label="Register repository"
          describedBy={null}
          width={480}
          fieldsChanged
          onClose={onClose}
        >
          <p>body</p>
        </DialogShell>,
      );

      await clickOutside();

      expect(onClose).not.toHaveBeenCalled();
    });

    it("leaves Escape working", async () => {
      const onClose = vi.fn();
      render(
        <DialogShell
          label="Register repository"
          describedBy={null}
          width={480}
          fieldsChanged
          onClose={onClose}
        >
          <p>body</p>
        </DialogShell>,
      );

      await userEvent.keyboard("{Escape}");

      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("holds the panel open against a click outside while closing is disabled", async () => {
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

    await clickOutside();

    expect(onClose).not.toHaveBeenCalled();
  });

  it("takes the outline the caller computed", () => {
    render(
      <DialogShell
        label="Remove tdd"
        describedBy={null}
        width={480}
        border="border-red-7"
        onClose={() => {}}
      >
        <p>body</p>
      </DialogShell>,
    );

    expect(screen.getByRole("dialog")).toHaveClass("border-red-7");
  });
});
