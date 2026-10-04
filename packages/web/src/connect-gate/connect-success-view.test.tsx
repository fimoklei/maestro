import type { ConnectOutcome } from "@maestro/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConnectSuccessView } from "./connect-success-view";

const PRIVATE_ACCESS =
  "Teammates need their own GitHub and APM access to a private Harness.";

const outcomeCases: Array<{
  outcome: ConnectOutcome;
  expected: string[];
  forbidden: RegExp[];
}> = [
  {
    outcome: "found",
    expected: ["Harness connected", "7 items are ready in the Inventory."],
    forbidden: [/private harness/i, /deploys never write back/i],
  },
  {
    outcome: "joined",
    expected: [
      "Harness connected",
      "7 items are ready in the Inventory.",
      PRIVATE_ACCESS,
    ],
    forbidden: [/deploys never write back/i, /found/i],
  },
  {
    outcome: "scaffolded",
    expected: ["Harness created", "It has no skills yet."],
    forbidden: [/skill checks/i, /7 items/i, /private harness/i],
  },
];

describe("ConnectSuccessView", () => {
  it.each(outcomeCases)(
    "states the honest completion copy for $outcome",
    ({ outcome, expected, forbidden }) => {
      renderSuccess(outcome);

      for (const phrase of expected) {
        expect(screen.getByText(phrase)).toBeInTheDocument();
      }
      for (const phrase of forbidden) {
        expect(screen.queryByText(phrase)).not.toBeInTheDocument();
      }
    },
  );

  // Null is an unread count, never stated as zero (#841).
  it("names no count when the released count could not be read", () => {
    render(
      <ConnectSuccessView
        outcome="found"
        primitiveCount={null}
        inventoryPath="/home/me/agent-harness"
        onContinue={vi.fn()}
      />,
    );

    expect(screen.getByText("Harness connected")).toBeInTheDocument();
    expect(
      screen.getByText("The Harness is ready in the Inventory."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/items/i)).not.toBeInTheDocument();
  });

  it("shows the source and exposes a keyboard-accessible continue action", async () => {
    const onContinue = vi.fn();
    renderSuccess("joined", onContinue);

    expect(screen.getByText("…/me/agent-harness")).toHaveAttribute(
      "title",
      "/home/me/agent-harness",
    );
    const continueButton = screen.getByRole("button", {
      name: /continue to inventory/i,
    });
    continueButton.focus();
    await userEvent.keyboard("{Enter}");

    expect(onContinue).toHaveBeenCalledOnce();
  });
});

function renderSuccess(outcome: ConnectOutcome, onContinue = vi.fn()) {
  return render(
    <ConnectSuccessView
      outcome={outcome}
      primitiveCount={7}
      inventoryPath="/home/me/agent-harness"
      onContinue={onContinue}
    />,
  );
}
