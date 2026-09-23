import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DialogHeader } from "./dialog-header";

describe("DialogHeader", () => {
  it("titles the dialog at level 2 and closes from its Close control", async () => {
    const onClose = vi.fn();
    render(<DialogHeader title="Register a repository" onClose={onClose} />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Register a repository" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps Close focusable while the action runs, and says why it waits", async () => {
    const onClose = vi.fn();
    render(
      <DialogHeader title="Register a repository" onClose={onClose} busy />,
    );

    const close = screen.getByRole("button", {
      name: "Close — action still running",
    });
    expect(close).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(close);

    expect(onClose).not.toHaveBeenCalled();
  });
});
