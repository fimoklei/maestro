import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IconButton } from "./icon-button";

function renderButton(props: Partial<Parameters<typeof IconButton>[0]> = {}) {
  return render(
    <IconButton label="Re-read Inventory" {...props}>
      <svg aria-hidden="true" />
    </IconButton>,
  );
}

describe("IconButton", () => {
  it("names itself by its action, since it shows no words", () => {
    renderButton();

    expect(
      screen.getByRole("button", { name: "Re-read Inventory" }),
    ).toBeInTheDocument();
  });

  it("calls onClick when activated", async () => {
    const onClick = vi.fn();
    renderButton({ onClick });

    await userEvent.click(
      screen.getByRole("button", { name: "Re-read Inventory" }),
    );

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("stays focusable and states why while it is unavailable", async () => {
    // An unavailable control keeps its Tab stop and says what blocks it, so a
    // keyboard reader learns the reason instead of losing the control
    // (design.md → Keyboard and screen reader).
    const onClick = vi.fn();
    renderButton({ unavailable: "No Harness connected", onClick });

    const button = screen.getByRole("button", {
      name: "Re-read Inventory — No Harness connected",
    });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toBeDisabled();

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
