import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GatedButton } from "./gated-button";

describe("GatedButton", () => {
  it("keeps its label as its name and states its cause in its tooltip alone", async () => {
    const onClick = vi.fn();
    render(
      <GatedButton
        label="Create a release"
        unavailable="Status out of date"
        onClick={onClick}
      />,
    );

    const button = screen.getByRole("button", { name: "Create a release" });
    expect(button).toHaveAccessibleDescription("Status out of date");
    expect(screen.queryByText("Status out of date")).toBeNull();
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toBeDisabled();

    await userEvent.tab();
    expect(button).toHaveFocus();
    const tooltip = await screen.findByRole("tooltip", { hidden: true });
    expect(tooltip).toHaveTextContent("Status out of date");
    // The open tooltip must not say the cause a second time.
    expect(button).toHaveAccessibleDescription("Status out of date");

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("runs and carries no description when available", async () => {
    const onClick = vi.fn();
    render(
      <GatedButton
        label="Create a release"
        unavailable={null}
        onClick={onClick}
      />,
    );

    const button = screen.getByRole("button", { name: "Create a release" });
    expect(button).not.toHaveAttribute("aria-disabled");
    expect(button).not.toHaveAttribute("aria-describedby");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalled();
  });
});
