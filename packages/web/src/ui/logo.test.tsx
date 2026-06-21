import { render, screen } from "@testing-library/react";
import { Logo } from "./logo";

describe("Logo", () => {
  it("renders the M mark", () => {
    render(<Logo />);
    expect(screen.getByText("M")).toBeInTheDocument();
  });

  it("omits the wordmark by default and shows it when requested", () => {
    const { rerender } = render(<Logo />);
    expect(screen.queryByText("Maestro")).not.toBeInTheDocument();
    rerender(<Logo wordmark />);
    expect(screen.getByText("Maestro")).toBeInTheDocument();
  });

  it("renders a context line when given", () => {
    render(<Logo context="agent-harness · main · 9 primitives" />);
    expect(
      screen.getByText("agent-harness · main · 9 primitives"),
    ).toBeInTheDocument();
  });

  it("sizes the tile from the size prop", () => {
    render(<Logo size={40} />);
    const tile = screen.getByText("M");
    expect(tile.style.width).toBe("40px");
    expect(tile.style.height).toBe("40px");
  });
});
