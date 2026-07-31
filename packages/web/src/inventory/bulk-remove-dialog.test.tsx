import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BulkRemoveDialog } from "./bulk-remove-dialog";

// Thin on purpose (#422): the held confirm, the live cancel, and the dialog's
// deafness while the run is in flight. Grouping and the report are their own
// tickets, and their shapes are tested in their own view-models.
function renderDialog(
  props: Partial<React.ComponentProps<typeof BulkRemoveDialog>> = {},
) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  render(
    <BulkRemoveDialog
      skillName="tdd"
      targetCount={3}
      answeredCount={3}
      isRemoving={false}
      error={null}
      onCancel={onCancel}
      onConfirm={onConfirm}
      {...props}
    />,
  );
  return { onCancel, onConfirm };
}

describe("BulkRemoveDialog — before the run", () => {
  it("holds the confirm until every check has answered", async () => {
    const { onConfirm } = renderDialog({ answeredCount: 1 });

    const confirm = screen.getByRole("button", { name: /^remove from/i });
    expect(confirm).toBeDisabled();
    await userEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("says how many checks have answered while they run", () => {
    renderDialog({ answeredCount: 1 });

    expect(screen.getByRole("dialog")).toHaveTextContent(
      "checking 3 targets — 1 answered",
    );
  });

  it("offers the confirm once every check has answered", () => {
    renderDialog();

    expect(
      screen.getByRole("button", { name: "remove from 3 →" }),
    ).toBeEnabled();
  });

  it("cancels while the checks are still running, removing nothing", async () => {
    const { onCancel, onConfirm } = renderDialog({ answeredCount: 0 });

    const cancel = screen.getByRole("button", { name: "cancel" });
    expect(cancel).toBeEnabled();
    await userEvent.click(cancel);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("BulkRemoveDialog — during the run", () => {
  it("disables both controls", () => {
    renderDialog({ isRemoving: true });

    expect(screen.getByRole("button", { name: /removing/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: "cancel" })).toBeDisabled();
  });

  it("ignores Escape, so the user cannot walk away into a partial state", async () => {
    const { onCancel } = renderDialog({ isRemoving: true });

    await userEvent.keyboard("{Escape}");

    expect(onCancel).not.toHaveBeenCalled();
  });

  it("ignores the backdrop for the same reason", async () => {
    // Hidden from the a11y tree, so it is reached the way a mouse reaches it.
    const { onCancel } = renderDialog({ isRemoving: true });

    const backdrop = document.querySelector("[aria-hidden='true']");
    await userEvent.click(backdrop as Element);

    expect(onCancel).not.toHaveBeenCalled();
  });

  it("offers no confirm once the outcome is unknown — looking comes before another run", async () => {
    // The body tells the user to close and check. A live confirm beside it
    // would repeat a destructive run whose result nobody has seen.
    const { onCancel, onConfirm } = renderDialog({
      error:
        "Maestro lost its server's answer and cannot say what was removed.",
    });

    expect(screen.queryByRole("button", { name: /^remove from/i })).toBeNull();
    const controls = screen.getAllByRole("button");
    expect(controls.map((control) => control.textContent)).toEqual(["close"]);

    await userEvent.click(screen.getByRole("button", { name: "close" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
