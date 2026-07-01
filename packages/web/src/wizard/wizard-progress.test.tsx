import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WizardProgress } from "./wizard-progress";

describe("WizardProgress", () => {
  it("marks the active step and lists every step in order", () => {
    render(<WizardProgress activeStep={1} />);

    const steps = screen.getAllByRole("listitem");
    expect(steps.map((step) => step.textContent)).toEqual([
      "1 · connect inventory",
      "2 · register repos",
      "3 · deploy",
    ]);
    expect(steps[0]).toHaveAttribute("aria-current", "step");
    expect(steps[1]).not.toHaveAttribute("aria-current");
    expect(steps[2]).not.toHaveAttribute("aria-current");
  });
});
