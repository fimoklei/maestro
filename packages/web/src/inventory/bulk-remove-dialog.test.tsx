import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BulkRemoveDialog } from "./bulk-remove-dialog";
import type { BulkRemoveDialogView } from "./bulk-remove-dialog-view";
import type { BulkRemoveReportView } from "./bulk-remove-report-view";

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
      reason: "Nothing recorded — may lose work",
    },
    {
      label: "/dev/design-tokens",
      version: "v1.2.0",
      reason: "Check did not run",
    },
  ],
  refused: [{ label: "/dev/legacy-etl", reason: "Repository not registered" }],
  removableCount: 3,
  confirmLabel: "Remove from 3 targets · 2 lose local edits",
};

function renderDialog(
  props: Partial<React.ComponentProps<typeof BulkRemoveDialog>> = {},
) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  const dialog = (
    extra: Partial<React.ComponentProps<typeof BulkRemoveDialog>>,
  ) => (
    <BulkRemoveDialog
      skillName="tdd"
      targetCount={3}
      view={allClean}
      isRemoving={false}
      report={null}
      onCancel={onCancel}
      onConfirm={onConfirm}
      {...props}
      {...extra}
    />
  );
  const view = render(dialog({}));
  return {
    onCancel,
    onConfirm,
    rerender: (extra: Partial<React.ComponentProps<typeof BulkRemoveDialog>>) =>
      view.rerender(dialog(extra)),
  };
}

describe("BulkRemoveDialog — while the checks run", () => {
  const checking: BulkRemoveDialogView = {
    kind: "checking",
    line: "Checking 3 targets — 1 answered",
  };

  it("names the primitive's type beside the question, as a plain word", () => {
    renderDialog();

    expect(screen.getByText("Skill")).toBeInTheDocument();
  });

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
      "Checking 3 targets — 1 answered",
    );
  });

  it("cancels while the checks are still running, removing nothing", async () => {
    const { onCancel, onConfirm } = renderDialog({ view: checking });

    const cancel = screen.getByRole("button", { name: "Cancel" });
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
    expect(screen.queryByText(/Loses work/)).toBeNull();
    expect(screen.queryByText(/CAN'T BE REMOVED/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "remove from 3 →" }),
    ).toBeEnabled();
  });

  it("groups what the removal costs, with each target's version and reason", () => {
    renderDialog({ view: withCost });

    expect(screen.getByText("▲ Loses work · 2")).toBeInTheDocument();
    const cost = screen.getByRole("group", { name: "▲ Loses work · 2" });
    expect(cost).toHaveTextContent("/dev/acme-api");
    expect(cost).toHaveTextContent("v1.0.0");
    expect(cost).toHaveTextContent("Nothing recorded — may lose work");
    expect(cost).toHaveTextContent("Check did not run");
  });

  // A target that cannot be touched costs nothing and loses nothing — putting
  // it beside the clean count would price it as one or the other.
  it("keeps what cannot be removed in its own group, without a version", () => {
    renderDialog({ view: withCost });

    const refused = screen.getByRole("group", {
      name: "✕ Cannot be removed · 1",
    });
    expect(refused).toHaveTextContent("/dev/legacy-etl");
    expect(refused).toHaveTextContent("Repository not registered");
    expect(within(refused).queryByText(/^v\d/)).toBeNull();
  });

  // The footer every dialog shares (#1116).
  it("confirms with the outlined danger button, Cancel on the leading side", () => {
    renderDialog();

    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(cancel.parentElement?.firstElementChild).toBe(cancel);
    expect(cancel.parentElement).toHaveClass("justify-between");
    const confirm = screen.getByRole("button", { name: "remove from 3 →" });
    expect(confirm).toHaveClass("text-red-11", "border-red-7");
    expect(confirm).not.toHaveClass("bg-gray-12");
  });

  it("opens with focus on Cancel, so Enter removes nothing", async () => {
    renderDialog();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus(),
    );
  });

  it("keeps the confirm live beside a refusal, carrying the cost on it", () => {
    renderDialog({ view: withCost });

    expect(
      screen.getByRole("button", {
        name: "Remove from 3 targets · 2 lose local edits",
      }),
    ).toBeEnabled();
  });

  it("takes the confirm away when every target refused", () => {
    renderDialog({
      view: {
        kind: "grouped",
        cleanLine: null,
        cost: [],
        refused: [
          { label: "/dev/legacy-etl", reason: "Repository not registered" },
        ],
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
    ).toEqual(["Cancel", "Remove from 3 targets · 2 lose local edits"]);
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
    expect(screen.getByRole("dialog")).toHaveClass("border-amber-7");
  });

  it("keeps its plain outline when the removal costs nothing", () => {
    renderDialog();
    expect(screen.getByRole("dialog")).not.toHaveClass("border-amber-7");
  });
});

describe("BulkRemoveDialog — during the run", () => {
  const running = { view: withCost, isRemoving: true };

  it("replaces the body with the walk, counting only what it will touch", () => {
    renderDialog(running);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Removing from 3 targets, one at a time");
    expect(screen.queryByText(/Loses work/)).toBeNull();
    expect(screen.queryByText(/clean copies/)).toBeNull();
  });

  it("holds both controls unpressable", () => {
    renderDialog(running);

    // The write's own control stays focusable and states why; closing must not
    // happen mid-run, so Cancel is disabled outright.
    expect(screen.getByRole("button", { name: /removing/i })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("ignores Escape, so the user cannot walk away into a partial state", async () => {
    const { onCancel } = renderDialog(running);

    await userEvent.keyboard("{Escape}");

    expect(onCancel).not.toHaveBeenCalled();
  });

  it("ignores the backdrop for the same reason", async () => {
    // Reached the way a mouse reaches it: Radix takes pointer events off the
    // page behind a modal, so that check is skipped rather than worked around.
    const { onCancel } = renderDialog(running);

    fireEvent.pointerDown(document.body);
    fireEvent.click(document.body);

    expect(onCancel).not.toHaveBeenCalled();
  });

  it("offers no confirm once Outcome unknown — looking comes before another run", async () => {
    // The body tells the user to close and check. A live confirm beside it
    // would repeat a destructive run whose result nobody has seen.
    const { onCancel, onConfirm } = renderDialog({
      report: {
        kind: "outcome-unknown",
        label: "Outcome unknown",
        message: "The run's outcome is unrecorded.",
        detail: "The Maestro server did not answer.",
      },
    });

    expect(screen.queryByRole("button", { name: /^remove from/i })).toBeNull();
    const controls = screen.getAllByRole("button");
    expect(controls.map((control) => control.textContent)).toEqual(["Close"]);

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  // Answered before the walk began, so the same attempt can be made again.
  it("keeps the confirm live when Run not started", async () => {
    const { onConfirm } = renderDialog({
      view: withCost,
      report: {
        kind: "never-started",
        label: "Run not started",
        message: "Nothing was removed anywhere. Confirm the removal again.",
        detail: "The Maestro server refused the request.",
      },
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Run not started");
    expect(screen.getByText("▲ Loses work · 2")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /^remove from/i }),
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("BulkRemoveDialog — once the run reports", () => {
  const clean: BulkRemoveReportView = {
    kind: "clean",
    title: { before: "Removed ", after: "" },
    counts: "Removed 3 · refused 0 · failed 0",
  };

  const partial: BulkRemoveReportView = {
    kind: "partial",
    title: { before: "Removed ", after: " from 1 of 3 targets" },
    counts: "Removed 1 · refused 1 · failed 1",
    leftAlone: [
      {
        label: "/dev/acme-api",
        outcome: "failed",
        reason: "Target held by another operation",
      },
      {
        label: "/dev/legacy-etl",
        outcome: "refused",
        reason: "Repository not registered",
      },
    ],
  };

  it("reads as one line when every target came off, with no group beside it", () => {
    renderDialog({ report: clean });

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("Removed tdd");
    expect(dialog).toHaveTextContent("Removed 3 · refused 0 · failed 0");
    expect(screen.queryByText(/LEFT ALONE/)).toBeNull();
    expect(screen.queryByText(/clean copies/)).toBeNull();
  });

  it("names the split in the title, so the outcome lands before any detail", () => {
    renderDialog({ report: partial });

    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      "Removed tdd from 1 of 3 targets",
    );
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Removed 1 · refused 1 · failed 1",
    );
  });

  it("gives every left-alone target its class and its own reason", () => {
    renderDialog({ report: partial });

    const group = screen.getByRole("group", { name: "✕ Left alone · 2" });
    expect(group).toHaveTextContent("/dev/acme-api");
    expect(group).toHaveTextContent("failed");
    expect(group).toHaveTextContent("Target held by another operation");
    expect(group).toHaveTextContent("/dev/legacy-etl");
    expect(group).toHaveTextContent("refused");
    expect(group).toHaveTextContent("Repository not registered");
  });

  it("takes the danger outline once a target was left behind", () => {
    renderDialog({ report: partial });
    expect(screen.getByRole("dialog")).toHaveClass("border-red-7");
  });

  // Nothing left to confirm once the run is over.
  it("leaves one way out and no retry, whatever the run left behind", async () => {
    const { onCancel } = renderDialog({ report: clean });
    expect(
      screen.getAllByRole("button").map((control) => control.textContent),
    ).toEqual(["Done"]);

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("says close rather than done when the run left something behind", () => {
    renderDialog({ report: partial });
    expect(
      screen.getAllByRole("button").map((control) => control.textContent),
    ).toEqual(["Close"]);
  });

  it("announces the outcome in a live region mounted before it", () => {
    const { rerender } = renderDialog({});
    const live = screen.getByLabelText("Bulk removal result");
    expect(live).toHaveTextContent("");

    rerender({ report: partial });
    expect(screen.getByLabelText("Bulk removal result")).toHaveTextContent(
      "Removed tdd from 1 of 3 targets · Removed 1 · refused 1 · failed 1",
    );
  });
});
