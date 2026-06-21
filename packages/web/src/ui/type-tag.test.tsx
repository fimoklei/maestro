import { render, screen } from "@testing-library/react";
import { TypeTag } from "./type-tag";

describe("TypeTag", () => {
  it("renders the primitive type as its label", () => {
    render(<TypeTag type="hook" />);
    expect(screen.getByText("hook")).toBeInTheDocument();
  });

  it("is type-aware across skill, hook, mcp and bundle", () => {
    for (const type of ["skill", "hook", "mcp", "bundle"] as const) {
      const { unmount } = render(<TypeTag type={type} />);
      expect(screen.getByText(type)).toBeInTheDocument();
      unmount();
    }
  });

  it("defaults to skill when no type is given", () => {
    render(<TypeTag />);
    expect(screen.getByText("skill")).toBeInTheDocument();
  });
});
