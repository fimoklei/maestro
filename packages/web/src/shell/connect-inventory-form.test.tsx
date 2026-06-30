import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConnectInventoryForm } from "./connect-inventory-form";

describe("ConnectInventoryForm", () => {
  it("calls onBrowse when the browse action is activated", async () => {
    const onBrowse = vi.fn();
    render(<ConnectInventoryForm onSubmit={vi.fn()} onBrowse={onBrowse} />);
    await userEvent.click(screen.getByRole("button", { name: /browse/i }));
    expect(onBrowse).toHaveBeenCalledOnce();
  });

  it("omits the browse action when onBrowse is not provided", () => {
    render(<ConnectInventoryForm onSubmit={vi.fn()} />);
    expect(
      screen.queryByRole("button", { name: /browse/i }),
    ).not.toBeInTheDocument();
  });
});
