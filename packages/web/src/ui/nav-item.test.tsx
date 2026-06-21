import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NavItem } from "./nav-item";

describe("NavItem", () => {
  it("renders a button carrying its label", () => {
    render(<NavItem label="Deploy-state" />);
    expect(
      screen.getByRole("button", { name: "Deploy-state" }),
    ).toBeInTheDocument();
  });

  it("calls onClick when activated", async () => {
    const onClick = vi.fn();
    render(<NavItem label="Inventory" onClick={onClick} />);
    await userEvent.click(screen.getByRole("button", { name: "Inventory" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("marks the active item with aria-current=page", () => {
    const { rerender } = render(<NavItem label="Compose" />);
    expect(screen.getByRole("button", { name: "Compose" })).not.toHaveAttribute(
      "aria-current",
    );
    rerender(<NavItem label="Compose" active />);
    expect(screen.getByRole("button", { name: "Compose" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
