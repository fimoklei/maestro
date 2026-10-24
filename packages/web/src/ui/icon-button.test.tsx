import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectTooltipCause } from "../test-utils";
import { IconButton } from "./icon-button";

function renderButton(props: Partial<Parameters<typeof IconButton>[0]> = {}) {
  return render(
    <IconButton label="Re-read Skills" {...props}>
      <svg aria-hidden="true" />
    </IconButton>,
  );
}

describe("IconButton", () => {
  it("names itself by its action, since it shows no words", () => {
    renderButton();

    expect(
      screen.getByRole("button", { name: "Re-read Skills" }),
    ).toBeInTheDocument();
  });

  it("calls onClick when activated", async () => {
    const onClick = vi.fn();
    renderButton({ onClick });

    await userEvent.click(
      screen.getByRole("button", { name: "Re-read Skills" }),
    );

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("keeps its plain label and states why in its tooltip", async () => {
    const onClick = vi.fn();
    renderButton({ label: "Filter", unavailable: "No skills yet", onClick });

    const button = screen.getByRole("button", { name: "Filter" });
    expectTooltipCause(button, "No skills yet");
    expect(button).not.toBeDisabled();
    await userEvent.tab();
    expect(
      await screen.findByRole("tooltip", { hidden: true }),
    ).toHaveTextContent("No skills yet");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("stays named and focusable while busy, and ignores a second press", async () => {
    const onClick = vi.fn();
    renderButton({ busy: true, onClick });

    const button = screen.getByRole("button", { name: "Re-read Skills" });
    expect(button).toHaveAttribute("aria-busy", "true");
    await userEvent.click(button);

    expect(onClick).not.toHaveBeenCalled();
  });
});
