import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WithdrawDialog } from "./withdraw-dialog";

describe("WithdrawDialog", () => {
  it("sets the skill name in the UI font, not mono", () => {
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

    const name = screen.getByText("research", { selector: "dd" });
    expect(name).toHaveClass("font-ui");
    expect(name).not.toHaveClass("font-mono");
  });
});
