import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectVisibleCause } from "../test-utils";
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

  it("stays focusable and states why while it is unavailable", async () => {
    const onClick = vi.fn();
    renderButton({ unavailable: "No Harness connected", onClick });

    const button = screen.getByRole("button", {
      name: "Re-read Skills — No Harness connected",
    });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toBeDisabled();

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("keeps its plain label and is described by visible text that says why", async () => {
    const onClick = vi.fn();
    render(
      <>
        <IconButton
          label="Filter"
          unavailable={{ describedBy: "empty" }}
          onClick={onClick}
        >
          <svg aria-hidden="true" />
        </IconButton>
        <h2 id="empty">No skills yet</h2>
      </>,
    );

    const button = screen.getByRole("button", { name: "Filter" });
    expectVisibleCause(button, "No skills yet");
    expect(button).not.toBeDisabled();
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
