import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConnectInventoryForm } from "./connect-inventory-form";

describe("ConnectInventoryForm", () => {
  it("calls onBrowse when the browse action is activated", async () => {
    const onBrowse = vi.fn();
    render(
      <ConnectInventoryForm
        path=""
        onPathChange={vi.fn()}
        onSubmit={vi.fn()}
        onBrowse={onBrowse}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /browse/i }));
    expect(onBrowse).toHaveBeenCalledOnce();
  });

  it("omits the browse action when onBrowse is not provided", () => {
    render(
      <ConnectInventoryForm
        path=""
        onPathChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /browse/i }),
    ).not.toBeInTheDocument();
  });

  it("renders the given path as the field value", () => {
    render(
      <ConnectInventoryForm
        path="/home/me/agent-harness"
        onPathChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/inventory path/i)).toHaveValue(
      "/home/me/agent-harness",
    );
  });

  it("reports edits to the path via onPathChange instead of owning the value", () => {
    const onPathChange = vi.fn();
    render(
      <ConnectInventoryForm
        path=""
        onPathChange={onPathChange}
        onSubmit={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText(/inventory path/i), {
      target: { value: "/x" },
    });
    expect(onPathChange).toHaveBeenCalledWith("/x");
  });

  it("submits the path passed in via props, not stale internal state", async () => {
    const onSubmit = vi.fn();
    render(
      <ConnectInventoryForm
        path="/home/me/agent-harness"
        onPathChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /connect/i }));
    expect(onSubmit).toHaveBeenCalledWith("/home/me/agent-harness");
  });
});
