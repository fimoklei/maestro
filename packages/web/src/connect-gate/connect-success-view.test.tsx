import type { ConnectOutcome } from "@maestro/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConnectSuccessView } from "./connect-success-view";

const outcomeCases: Array<{
  outcome: ConnectOutcome;
  expected: RegExp[];
  forbidden: RegExp[];
}> = [
  {
    outcome: "found",
    expected: [
      /7 primitives found/i,
      /deploys never write back to this harness/i,
    ],
    forbidden: [/cloned/i, /advisory/i, /empty/i],
  },
  {
    outcome: "joined",
    expected: [/harness joined/i, /7 primitives found/i, /cloned harness/i],
    forbidden: [/deploys never write back to this harness/i, /advisory/i],
  },
  {
    outcome: "scaffolded",
    expected: [
      /harness scaffolded/i,
      /harness is empty/i,
      /skill-check workflow is advisory/i,
      /only becomes a gate if the team makes it a required check/i,
    ],
    forbidden: [
      /deploys never write back to this harness/i,
      /7 primitives found/i,
    ],
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
