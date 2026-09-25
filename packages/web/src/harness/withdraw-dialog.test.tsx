import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WithdrawDialog } from "./withdraw-dialog";

const renderDialog = () =>
  render(
    <WithdrawDialog
      skill="research"
      number={45}
      onClose={vi.fn()}
      onConfirm={vi.fn()}
      withdrawing={false}
      withdrawError={null}
    />,
  );

describe("WithdrawDialog", () => {
  it("confirms with the outlined danger button, Cancel on the leading side", () => {
    renderDialog();

    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(cancel.parentElement?.firstElementChild).toBe(cancel);
    expect(cancel.parentElement).toHaveClass("justify-between");
    const confirm = screen.getByRole("button", { name: "Withdraw proposal" });
    expect(confirm).toHaveClass("text-red-11", "border-red-7");
  });

  it("opens with focus on Cancel, so Enter closes no pull request", async () => {
    renderDialog();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus(),
    );
  });
});
