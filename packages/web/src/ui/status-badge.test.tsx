import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "./status-badge";
import { reading } from "./status-reading";

describe("StatusBadge", () => {
  it("states the status as a word, readable without colour", () => {
    render(<StatusBadge reading={reading("Behind", "attention")} />);

    expect(screen.getByText("Behind")).toBeInTheDocument();
  });

  it("marks the family with a dot, kept out of the name", () => {
    const { container } = render(
      <StatusBadge reading={reading("Unknown", "unknown")} />,
    );

    const dot = screen.getByText("Unknown").firstElementChild;
    expect(dot).toHaveAttribute("aria-hidden", "true");
    expect(dot).toHaveClass("size-1.5", "rounded-full");
    expect(container).toHaveTextContent(/^Unknown$/);
  });

  it.each([
    [
      "good",
      "Up to date",
      ["bg-green-3", "border-green-7/50", "text-green-12"],
      "bg-green-11",
    ],
    [
      "neutral",
      "Not deployed",
      ["bg-gray-3", "border-gray-7/50", "text-gray-11"],
      "bg-gray-11",
    ],
    [
      "unknown",
      "Unknown",
      ["bg-gray-3", "border-gray-7/50", "text-gray-11"],
      "bg-gray-11",
    ],
    [
      "attention",
      "Behind",
      ["bg-amber-3", "border-amber-7/50", "text-amber-12"],
      "bg-amber-11",
    ],
    [
      "failed",
      "Failed",
      ["bg-red-3", "border-red-7/50", "text-red-12"],
      "bg-red-11",
    ],
  ] as const)(
    "gives a %s reading its family's fill, soft border and dot",
    (family, word, badgeClasses, dotClass) => {
      render(<StatusBadge reading={reading(word, family)} />);

      const badge = screen.getByText(word);
      expect(badge).toHaveClass("border", "px-inline", ...badgeClasses);
      expect(badge.firstElementChild).toHaveClass(dotClass);
    },
  );
});
