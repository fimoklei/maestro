import { render, screen } from "@testing-library/react";
import { Card } from "./card";

describe("Card", () => {
  it("renders its children", () => {
    render(<Card>body content</Card>);
    expect(screen.getByText("body content")).toBeInTheDocument();
  });
});
