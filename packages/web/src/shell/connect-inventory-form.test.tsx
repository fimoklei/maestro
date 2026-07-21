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

  it("gives the path input a tokenized amber focus-visible ring, not the UA default", () => {
    render(
      <ConnectInventoryForm
        path=""
        onPathChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    const input = screen.getByLabelText(/inventory path/i);
    expect(input).toHaveClass(
      "focus-visible:outline-2",
      "focus-visible:outline-offset-2",
      "focus-visible:outline-amber",
    );
    // outline-none would set --tw-outline-style:none, which outline-2 reads —
    // silently hiding the ring. Guard against a regression that re-adds it.
    expect(input).not.toHaveClass("outline-none");
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

  it("renders the no-usable-origin card with a browse-again call to action", async () => {
    const onBrowse = vi.fn();
    render(
      <ConnectInventoryForm
        path="/home/me/skills-only-folder"
        onPathChange={vi.fn()}
        onSubmit={vi.fn()}
        error="Server explanation of the refusal."
        noUsableOrigin
        onBrowse={onBrowse}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/no usable git origin/i);
    expect(alert).toHaveTextContent("Server explanation of the refusal.");
    await userEvent.click(
      screen.getByRole("button", { name: /browse again/i }),
    );
    expect(onBrowse).toHaveBeenCalledOnce();
  });

  it("keeps the plain error text for errors other than no-usable-origin", () => {
    render(
      <ConnectInventoryForm
        path=""
        onPathChange={vi.fn()}
        onSubmit={vi.fn()}
        error="That directory has no skills/ folder, so it is not an inventory."
        onBrowse={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/no skills\/ folder/i);
    expect(
      screen.queryByRole("button", { name: /browse again/i }),
    ).not.toBeInTheDocument();
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
