import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BulkRemoveDialog } from "./bulk-remove-dialog";
import type { BulkRemoveDialogView } from "./bulk-remove-dialog-view";

const allClean: BulkRemoveDialogView = {
  kind: "grouped",
  cleanLine: "3 clean copies — nothing but the deployed files goes",
  cost: [],
  refused: [],
  removableCount: 3,
  confirmLabel: "remove from 3 →",
};

const withCost: BulkRemoveDialogView = {
  kind: "grouped",
  cleanLine: "1 clean copies",
  cost: [
    {
      label: "/dev/acme-api",
      version: "v1.0.0",
      reason: "local edits — deleted too",
    },
    {
      label: "/dev/design-tokens",
      version: "v1.2.0",
      reason: "check did not run",
    },
  ],
  refused: [{ label: "/dev/legacy-etl", reason: "repo not registered" }],
  removableCount: 3,
  confirmLabel: "remove from 3 · 2 lose local edits →",
};

function renderDialog(
  props: Partial<React.ComponentProps<typeof BulkRemoveDialog>> = {},
) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  render(
    <BulkRemoveDialog
      skillName="tdd"
      targetCount={3}
      view={allClean}
      isRemoving={false}
      error={null}
      onCancel={onCancel}
      onConfirm={onConfirm}
      {...props}
    />,
  );
  return { onCancel, onConfirm };
}

describe("BulkRemoveDialog — while the checks run", () => {
  const checking: BulkRemoveDialogView = {
    kind: "checking",
    line: "checking 3 targets — 1 answered",
  };

  it("holds the confirm until every check has answered", async () => {
    const { onConfirm } = renderDialog({ view: checking });

    const confirm = screen.getByRole("button", { name: /^remove from/i });
    expect(confirm).toBeDisabled();
    await userEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("says how many checks have answered", () => {
    renderDialog({ view: checking });

    expect(screen.getByRole("dialog")).toHaveTextContent(
      "checking 3 targets — 1 answered",
    );
  });

  it("cancels while the checks are still running, removing nothing", async () => {
    const { onCancel, onConfirm } = renderDialog({ view: checking });

    const cancel = screen.getByRole("button", { name: "cancel" });
    expect(cancel).toBeEnabled();
    await userEvent.click(cancel);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("BulkRemoveDialog — once the checks answer", () => {
  it("states that nothing else goes, and shows no group beside it", () => {
    renderDialog();

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(
      "3 clean copies — nothing but the deployed files goes",
    );
    expect(screen.queryByText(/LOSES WORK/)).toBeNull();
    expect(screen.queryByText(/CAN'T BE REMOVED/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "remove from 3 →" }),
    ).toBeEnabled();
  });

  it("groups what the removal costs, with each target's version and reason", () => {
    renderDialog({ view: withCost });

    expect(screen.getByText("▲ LOSES WORK · 2")).toBeInTheDocument();
    const cost = screen.getByRole("group", { name: "▲ LOSES WORK · 2" });
    expect(cost).toHaveTextContent("/dev/acme-api");
    expect(cost).toHaveTextContent("v1.0.0");
    expect(cost).toHaveTextContent("local edits — deleted too");
    expect(cost).toHaveTextContent("check did not run");
  });

  // A target that cannot be touched costs nothing and loses nothing — putting
  // it beside the clean count would price it as one or the other.
  it("keeps what cannot be removed in its own group, without a version", () => {
    renderDialog({ view: withCost });

    const refused = screen.getByRole("group", {
      name: "✕ CAN'T BE REMOVED · 1",
    });
    expect(refused).toHaveTextContent("/dev/legacy-etl");
    expect(refused).toHaveTextContent("repo not registered");
    expect(within(refused).queryByText(/^v\d/)).toBeNull();
  });

  it("keeps the confirm live beside a refusal, carrying the cost on it", () => {
    renderDialog({ view: withCost });

    expect(
      screen.getByRole("button", {
        name: "remove from 3 · 2 lose local edits →",
      }),
    ).toBeEnabled();
  });

  it("takes the confirm away when every target refused", () => {
    renderDialog({
      view: {
        kind: "grouped",
        cleanLine: null,
        cost: [],
        refused: [{ label: "/dev/legacy-etl", reason: "repo not registered" }],
        removableCount: 0,
        confirmLabel: "remove from 0 →",
      },
    });

    expect(
      screen.getByRole("button", { name: /^remove from/i }),
    ).toBeDisabled();
  });

  it("renders no clean line when nothing is clean", () => {
    renderDialog({
      view: { ...withCost, cleanLine: null },
    });

    expect(screen.queryByText(/clean copies/)).toBeNull();
  });

  // Nothing in a destructive dialog may look like a button.
  it("draws the group rows as static text", () => {
    renderDialog({ view: withCost });

    expect(
      screen.getAllByRole("button").map((control) => control.textContent),
    ).toEqual(["cancel", "remove from 3 · 2 lose local edits →"]);
    expect(screen.queryByRole("link")).toBeNull();
  });

  // The cost is read out with the question, not found afterwards.
  it("describes itself with the clean line and every group", () => {
    renderDialog({ view: withCost });

    const dialog = screen.getByRole("dialog");
    const described = (dialog.getAttribute("aria-describedby") ?? "").split(
      " ",
    );
    expect(described).toHaveLength(3);
    for (const id of described) {
      expect(document.getElementById(id)).not.toBeNull();
    }
  });

  it("warms its outline only while a cost group exists", () => {
    renderDialog({ view: withCost });
    expect(screen.getByRole("dialog")).toHaveClass("border-line-drift");
  });

  it("keeps its plain outline when the removal costs nothing", () => {
    renderDialog();
    expect(screen.getByRole("dialog")).not.toHaveClass("border-line-drift");
  });
});

describe("BulkRemoveDialog — during the run", () => {
  const running = { view: withCost, isRemoving: true };

  it("replaces the body with the walk, counting only what it will touch", () => {
    renderDialog(running);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("walking 3 targets, one at a time");
    expect(screen.queryByText(/LOSES WORK/)).toBeNull();
    expect(screen.queryByText(/clean copies/)).toBeNull();
  });

  it("disables both controls", () => {
    renderDialog(running);

    expect(screen.getByRole("button", { name: /removing/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: "cancel" })).toBeDisabled();
  });

  it("ignores Escape, so the user cannot walk away into a partial state", async () => {
    const { onCancel } = renderDialog(running);

    await userEvent.keyboard("{Escape}");

    expect(onCancel).not.toHaveBeenCalled();
  });

  it("ignores the backdrop for the same reason", async () => {
    // Hidden from the a11y tree, so it is reached the way a mouse reaches it.
    const { onCancel } = renderDialog(running);

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
