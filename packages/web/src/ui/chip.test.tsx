import { render, screen } from "@testing-library/react";
import { Chip } from "./chip";

describe("Chip", () => {
  it("renders its content", () => {
    render(<Chip>● in sync</Chip>);
    expect(screen.getByText("● in sync")).toBeInTheDocument();
  });

  it("still renders content when a tone is given", () => {
    render(<Chip tone="drift">▲ 2 drift</Chip>);
    expect(screen.getByText("▲ 2 drift")).toBeInTheDocument();
  });
});
