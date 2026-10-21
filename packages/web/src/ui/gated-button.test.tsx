import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GatedButton } from "./gated-button";

describe("GatedButton", () => {
  it("keeps its label as its name and is described by the visible cause", async () => {
    const onClick = vi.fn();
    render(
      <>
        <p id="cause">Status out of date</p>
        <GatedButton
          label="Create a release"
          unavailable={{ describedBy: "cause" }}
          onClick={onClick}
        />
      </>,
    );

    const button = screen.getByRole("button", { name: "Create a release" });
    expect(button).toHaveAccessibleDescription("Status out of date");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toBeDisabled();
    await userEvent.tab();
    expect(button).toHaveFocus();
    // Focus opens the tooltip, which must not take over the description.
    expect(button).toHaveAccessibleDescription("Status out of date");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("names a written cause after an em dash", () => {
    render(
      <GatedButton label="Create a release" unavailable="GitHub not read" />,
    );

    expect(
      screen.getByRole("button", {
        name: "Create a release — GitHub not read",
      }),
    ).toHaveAttribute("aria-disabled", "true");
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
