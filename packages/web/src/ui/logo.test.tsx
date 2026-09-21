import { render, screen } from "@testing-library/react";
import { Logo } from "./logo";

describe("Logo", () => {
  it("names the product once, in text a reader can select", () => {
    // The mark itself is decorative; the wordmark carries the name (ADR-0033
    // replaces the amber "M" tile with the neutral mark, #991).
    render(<Logo />);

    expect(screen.getByText("Maestro")).toBeInTheDocument();
  });

  it("hides the mark from the accessibility tree", () => {
    const { container } = render(<Logo />);

    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});
