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
import { Dialog, type DialogAction, type DialogProps } from "./dialog";
import { Select } from "./select";

const action = (overrides: Partial<DialogAction> = {}): DialogAction => ({
  label: "Restore skill",
  verb: "restore",
  tone: "primary",
  unavailable: null,
  onRun: vi.fn(),
  ...overrides,
});

const renderDialog = (overrides: Partial<DialogProps> = {}) =>
  render(
    <Dialog
      title="Restore research"
      version={null}
      width={480}
      phase="idle"
      action={action()}
      failure={null}
      describedBy={null}
      fieldsChanged={false}
      onClose={vi.fn()}
      {...overrides}
    >
      {overrides.children ?? <p>Body sentence.</p>}
    </Dialog>,
  );

// Radix registers its outside listener on the next tick, and dismisses on
// pointerdown.
const clickOutside = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  fireEvent.pointerDown(document.body);
  fireEvent.click(document.body);
};

describe("Dialog", () => {
  it("titles the panel, offers a ✕ Close, Cancel and the action", () => {
    renderDialog();

    expect(
      screen.getByRole("dialog", { name: "Restore research" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Restore research" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    const buttons = screen.getAllByRole("button").map((b) => b.textContent);
    expect(buttons.slice(-2)).toEqual(["Cancel", "Restore skill"]);
  });

  it("is modal", () => {
    renderDialog();

    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  });

  it("is described by the element the caller names, and by nothing else", () => {
    const { unmount } = renderDialog({ describedBy: "lead-in" });
    expect(screen.getByRole("dialog")).toHaveAttribute(
      "aria-describedby",
      "lead-in",
    );
    unmount();

    renderDialog();
    expect(screen.getByRole("dialog")).not.toHaveAttribute("aria-describedby");
  });

  it("closes from its ✕", async () => {
    const onClose = vi.fn();
    renderDialog({ onClose });

    await userEvent.click(
      screen.getAllByRole("button", { name: "Close" })[0] as HTMLElement,
    );

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on a click outside when nothing runs", async () => {
    const onClose = vi.fn();
    renderDialog({ onClose });

    await clickOutside();

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("traps Tab inside the panel", async () => {
    renderDialog({ phase: "outcome", action: null });

    const [x, close] = screen.getAllByRole("button");
    await userEvent.tab();
    expect(x).toHaveFocus();
    await userEvent.tab();
    expect(close).toHaveFocus();
    await userEvent.tab();
    expect(x).toHaveFocus();
  });

  describe("once a field has changed", () => {
    it("ignores a click outside", async () => {
      const onClose = vi.fn();
      renderDialog({ fieldsChanged: true, onClose });

      await clickOutside();

      expect(onClose).not.toHaveBeenCalled();
    });

    it("still closes on Escape", async () => {
      const onClose = vi.fn();
      renderDialog({ fieldsChanged: true, onClose });

      await userEvent.keyboard("{Escape}");

      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  // A dialog that closes by sending the reader on (a successful import opens a
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
            <Dialog
              title="Import a skill"
              version={null}
              width={480}
              phase="idle"
              action={action({
                label: "Import skill",
                onRun: () => {
                  setOpen(false);
                  setLanded(true);
                },
              })}
              failure={null}
              describedBy={null}
              fieldsChanged={false}
              onClose={() => setOpen(false)}
            >
              <p>Body sentence.</p>
            </Dialog>
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
        screen.getByRole("button", { name: "Import skill" }),
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(
        screen.getByRole("heading", { name: "code-review" }),
      ).toHaveFocus();
    });
  });

  it("appends the version to the title and the panel's name", () => {
    renderDialog({ title: "Remove tdd", version: "v1.2.0" });

    expect(
      screen.getByRole("dialog", { name: "Remove tdd v1.2.0" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Remove tdd v1.2.0" }),
    ).toBeInTheDocument();
  });

  describe("while the action runs", () => {
    it("blocks Escape, a click outside, the ✕ and Cancel", async () => {
      const onClose = vi.fn();
      renderDialog({ phase: "running", onClose });

      await userEvent.keyboard("{Escape}");
      await clickOutside();
      await userEvent.click(
        screen.getByRole("button", { name: "Close — action still running" }),
      );
      const cancel = screen.getByRole("button", { name: "Cancel" });
      expect(cancel).toBeDisabled();

      expect(onClose).not.toHaveBeenCalled();
    });

    it("puts the spinner and the verb's busy label on the action", async () => {
      const onRun = vi.fn();
      renderDialog({ phase: "running", action: action({ onRun }) });

      const busy = screen.getByRole("button", { name: "Restoring…" });
      expect(busy).toHaveAttribute("aria-busy", "true");
      await userEvent.click(busy);

      expect(onRun).not.toHaveBeenCalled();
    });
  });

  it("closes on Escape and on Cancel when nothing runs", async () => {
    const onClose = vi.fn();
    renderDialog({ onClose });

    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  describe("the leave control", () => {
    const failure = {
      level: "error",
      label: "Skill has staged changes",
      message: "Nothing was restored.",
    } as const;

    const footer = () =>
      screen.getAllByRole("button").map((button) => button.textContent);

    it("reads Close once the dialog shows an outcome", () => {
      renderDialog({ phase: "outcome" });

      expect(footer().slice(-2)).toEqual(["Close", "Restore skill"]);
    });

    it("reads Close once a failure is shown", () => {
      renderDialog({ failure });

      expect(footer().slice(-2)).toEqual(["Close", "Restore skill"]);
    });

    it("stands alone, trailing, once an outcome leaves no action", async () => {
      const onClose = vi.fn();
      renderDialog({ phase: "outcome", action: null, onClose });

      // The header's ✕, then the lone Close.
      expect(footer()).toEqual(["", "Close"]);
      await userEvent.click(screen.getAllByRole("button")[1] as HTMLElement);

      expect(onClose).toHaveBeenCalledOnce();
    });

    it("states the failure after the body, directly above the footer", () => {
      renderDialog({ failure });

      const notice = screen.getByRole("alert");
      const body = screen.getByText("Body sentence.");
      const leave = screen.getAllByRole("button", { name: "Close" }).at(-1);
      expect(notice).toHaveTextContent("Skill has staged changes");
      expect(body.compareDocumentPosition(notice)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
      expect(notice.compareDocumentPosition(leave as HTMLElement)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });

    it("is described by the failure when it has no body", () => {
      render(
        <Dialog
          title="Remove tdd"
          version={null}
          width={640}
          phase="outcome"
          action={null}
          failure={failure}
          describedBy={null}
          fieldsChanged={false}
          onClose={vi.fn()}
        >
          {null}
        </Dialog>,
      );

      expect(screen.getByRole("dialog")).toHaveAccessibleDescription(
        /Skill has staged changes/,
      );
    });
  });

  // The fill is the one trace of the variant a test can read.
  describe("the action's weight", () => {
    it("is the primary where nothing else claims it", () => {
      renderDialog();

      expect(screen.getByRole("button", { name: "Restore skill" })).toHaveClass(
        "bg-gray-12",
      );
    });

    it("is danger for a destructive action", () => {
      renderDialog({ action: action({ tone: "danger" }) });

      const confirm = screen.getByRole("button", { name: "Restore skill" });
      expect(confirm).toHaveClass("text-red-11");
      expect(confirm).not.toHaveClass("bg-gray-12");
    });

    it("steps down while a failure carries its own action", () => {
      renderDialog({
        failure: {
          level: "error",
          label: "Harness not found",
          message: "No Harness is at this path.",
          action: { label: "Create Harness", onClick: vi.fn() },
        },
      });

      expect(
        screen.getByRole("button", { name: "Restore skill" }),
      ).not.toHaveClass("bg-gray-12");
      expect(
        screen.getByRole("button", { name: "Create Harness" }),
      ).toBeInTheDocument();
    });
  });

  describe("where focus opens", () => {
    it("lands on Cancel for a destructive action", async () => {
      renderDialog({ action: action({ tone: "danger" }) });

      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus(),
      );
    });

    it("lands in the first enabled field of a form", async () => {
      renderDialog({
        children: (
          <>
            <input aria-label="Locked" disabled />
            <input aria-label="Folder path" />
            <input aria-label="Name" />
          </>
        ),
      });

      await waitFor(() =>
        expect(
          screen.getByRole("textbox", { name: "Folder path" }),
        ).toHaveFocus(),
      );
    });

    it("lands on the cockpit's Select when it is the first field", async () => {
      renderDialog({
        children: (
          <>
            <span id="target-name">Target</span>
            <Select
              labelledBy="target-name"
              value="global"
              options={[{ value: "global", label: "Global" }]}
              disabled={false}
              onValueChange={vi.fn()}
            />
          </>
        ),
      });

      await waitFor(() =>
        expect(screen.getByRole("combobox", { name: "Target" })).toHaveFocus(),
      );
    });

    it("lands on the panel otherwise, so its body is read first", async () => {
      renderDialog();

      await waitFor(() => expect(screen.getByRole("dialog")).toHaveFocus());
    });
  });

  describe("an action that cannot run yet", () => {
    it("stays focusable and names its cause", async () => {
      const onRun = vi.fn();
      renderDialog({
        action: action({ unavailable: "checking for local edits", onRun }),
      });

      const confirm = screen.getByRole("button", {
        name: "Restore skill — checking for local edits",
      });
      expect(confirm).toHaveAttribute("aria-disabled", "true");
      expect(confirm).not.toBeDisabled();
      await userEvent.click(confirm);

      expect(onRun).not.toHaveBeenCalled();
    });

    it("is not run by Enter in a field", async () => {
      const onRun = vi.fn();
      renderDialog({
        action: action({ unavailable: "folder not found", onRun }),
        children: <input aria-label="Folder path" />,
      });

      await userEvent.type(
        screen.getByRole("textbox", { name: "Folder path" }),
        "x{Enter}",
      );

      expect(onRun).not.toHaveBeenCalled();
    });
  });

  it("runs the action on Enter in a field", async () => {
    const onRun = vi.fn();
    renderDialog({
      action: action({ onRun }),
      children: <input aria-label="Folder path" />,
    });

    await userEvent.type(
      screen.getByRole("textbox", { name: "Folder path" }),
      "x{Enter}",
    );

    expect(onRun).toHaveBeenCalledOnce();
  });
});
