import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "./status-badge";
import { reading } from "./status-reading";

describe("StatusBadge", () => {
  it("states the status as a word, readable without colour", () => {
    render(<StatusBadge reading={reading("Behind", "attention")} />);

    expect(screen.getByText("Behind")).toBeInTheDocument();
  });

  it("shows the family's glyph beside the word but keeps it out of the name", () => {
    const { container } = render(
      <StatusBadge reading={reading("Unknown", "unknown")} />,
    );

    const glyph = screen.getByText("?");
    expect(glyph).toHaveAttribute("aria-hidden", "true");
    expect(container).toHaveTextContent("?Unknown");
  });
});
