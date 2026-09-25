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

  // Every family takes the same form: fill, 1px border, mark and word in its
  // colour (ADR-0033 §3). A healthy row is no exception (#1069).
  it.each([
    [
      "good",
      "Up to date",
      ["bg-green-3", "border-green-7", "text-green-12"],
      "text-green-11",
    ],
    [
      "neutral",
      "Not deployed",
      ["bg-gray-3", "border-gray-7", "text-gray-12"],
      "text-gray-11",
    ],
    [
      "unknown",
      "Unknown",
      ["bg-gray-3", "border-gray-7", "text-gray-12"],
      "text-gray-11",
    ],
    [
      "attention",
      "Behind",
      ["bg-amber-3", "border-amber-7", "text-amber-12"],
      "text-amber-11",
    ],
    [
      "failed",
      "Failed",
      ["bg-red-3", "border-red-7", "text-red-12"],
      "text-red-11",
    ],
  ] as const)(
    "gives a %s reading its family's fill, border and mark",
    (family, word, badgeClasses, glyphClass) => {
      render(<StatusBadge reading={reading(word, family)} />);

      const badge = screen.getByText(word);
      expect(badge).toHaveClass("border", ...badgeClasses);
      expect(badge.firstElementChild).toHaveClass(glyphClass);
    },
  );
});
