import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BulkRemoveDialog } from "./bulk-remove-dialog";
import type { BulkRemoveDialogView } from "./bulk-remove-dialog-view";
import type { BulkRemoveReportView } from "./bulk-remove-report-view";

const allClean: BulkRemoveDialogView = {
  kind: "grouped",
  clean: {
    label: "3 clean copies",
    message: "Only the deployed files are removed.",
  },
  cost: [],
  refused: [],
  removableCount: 3,
  confirmLabel: "remove from 3 →",
};

const withCost: BulkRemoveDialogView = {
  kind: "grouped",
  clean: {
    label: "1 clean copy",
    message: "Only the deployed files are removed.",
  },
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

const partial: BulkRemoveReportView = {
  kind: "report",
  heading: "Removed from 1 of 3 targets",
  removed: ["global"],
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

// Controls with visible words: the header's ✕ has none.
const footerLabels = () =>
  screen
    .getAllByRole("button")
    .filter((control) => control.textContent !== "")
    .map((control) => control.textContent);

describe("BulkRemoveDialog — while the checks run", () => {
  const checking: BulkRemoveDialogView = {
    kind: "checking",
    line: "Checking 3 targets — 1 answered",
  };

  it("holds the confirm until every check has answered, saying why", async () => {
    const { onConfirm } = renderDialog({ view: checking });

    const confirm = screen.getByRole("button", {
      name: "Remove from 3 targets — checking for local edits",
    });
    expect(confirm).toHaveAttribute("aria-disabled", "true");
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
    // #1458: the shared Notice at success, not a hand-rolled bar.
    const clean = within(dialog)
      .getAllByRole("status")
      .find((region) => region.textContent?.includes("3 clean copies"));
    expect(clean).toHaveTextContent(
      "3 clean copiesOnly the deployed files are removed.",
    );
    expect(within(clean as HTMLElement).getByText("✓")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(dialog).toHaveAccessibleDescription(
      /3 clean copies\s*Only the deployed files are removed\./,
    );
    expect(screen.queryByText(/Loses work/)).toBeNull();
    expect(screen.queryByText(/Cannot be removed/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "remove from 3 →" }),
    ).not.toHaveAttribute("aria-disabled");
  });

  it("groups what the removal costs, with each target's version and reason", () => {
    renderDialog({ view: withCost });

    const cost = screen.getByRole("group", { name: "⚠ Loses work · 2" });
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

  it("keeps the confirm live beside a refusal, carrying the cost on it", async () => {
    const { onConfirm } = renderDialog({ view: withCost });

    await userEvent.click(
      screen.getByRole("button", {
        name: "Remove from 3 targets · 2 lose local edits",
      }),
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("holds the confirm when every target refused, saying why", () => {
    renderDialog({
      view: {
        kind: "grouped",
        clean: null,
        cost: [],
        refused: [
          { label: "/dev/legacy-etl", reason: "Repository not registered" },
        ],
        removableCount: 0,
        confirmLabel: "remove from 0 →",
      },
    });

    expect(
      screen.getByRole("button", {
        name: "remove from 0 → — no target can be removed",
      }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("renders no clean line when nothing is clean", () => {
    renderDialog({
      view: { ...withCost, clean: null },
    });

    expect(screen.queryByText(/clean cop/)).toBeNull();
  });

  // Nothing in a destructive dialog may look like a button.
  it("draws the group rows as static text", () => {
    renderDialog({ view: withCost });

    expect(footerLabels()).toEqual([
      "Cancel",
      "Remove from 3 targets · 2 lose local edits",
    ]);
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
});

describe("BulkRemoveDialog — during the run", () => {
  const running = { view: withCost, isRemoving: true };

  it("keeps what it weighed in view while the confirm says Removing…", () => {
    renderDialog(running);

    expect(screen.getByText("⚠ Loses work · 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Removing…/ })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("offers no confirm once Outcome unknown — looking comes before another run", async () => {
    // The notice tells the user to close and check. A live confirm beside it
    // would repeat a destructive run whose result nobody has seen.
    const { onCancel, onConfirm } = renderDialog({
      report: {
        kind: "outcome-unknown",
        label: "Outcome unknown",
        message: "The run's outcome is unrecorded.",
        detail: "The Maestro server did not answer.",
      },
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Outcome unknown");
    expect(footerLabels()).toEqual(["Close"]);

    await userEvent.click(footerCloseButton());
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
    expect(screen.getByText("⚠ Loses work · 2")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /^remove from/i }),
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("BulkRemoveDialog — once the run reports", () => {
  it("keeps its title, so the Report's heading carries the result", () => {
    const { rerender } = renderDialog();
    const title = () =>
      screen.getByRole("heading", {
        level: 2,
        name: "Remove tdd from 3 targets",
      });
    expect(title()).toBeInTheDocument();

    rerender({ isRemoving: true });
    expect(title()).toBeInTheDocument();

    rerender({ isRemoving: false, report: partial });
    expect(title()).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 3,
        name: "Removed from 1 of 3 targets",
      }),
    ).toBeInTheDocument();
  });

  it("gives every left-alone target its class, worst first, and its own reason", () => {
    renderDialog({ report: partial });

    const groups = screen
      .getAllByRole("heading", { level: 4 })
      .map((heading) => heading.textContent);
    expect(groups).toEqual(["✕Failed1", "✕Refused1", "✓Removed1"]);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(
      "/dev/acme-apiTarget held by another operation",
    );
    expect(dialog).toHaveTextContent(
      "/dev/legacy-etlRepository not registered",
    );
    expect(dialog).toHaveTextContent("global");
  });

  it("leaves one way out, Close, and no retry", async () => {
    const { onCancel } = renderDialog({ report: partial });

    expect(footerLabels()).toEqual(["Close"]);
    await userEvent.click(footerCloseButton());
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

function footerCloseButton(): HTMLElement {
  return screen
    .getAllByRole("button", { name: "Close" })
    .find((control) => control.textContent === "Close") as HTMLElement;
}
