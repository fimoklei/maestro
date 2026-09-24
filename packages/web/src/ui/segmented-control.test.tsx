import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SegmentedControl } from "./segmented-control";

const segments = [
  { value: "all", label: "all" },
  { value: "skill", label: "skills" },
];

describe("SegmentedControl", () => {
  it("renders one button per segment with its label", () => {
    render(
      <SegmentedControl
        label="Filter by type"
        segments={segments}
        value="all"
        onChange={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "all" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "skills" })).toBeInTheDocument();
  });

  // A segment names a choice in plain words, which Geist Mono never sets
  // (design.md, #1117).
  it("sets its segments in the sans face", () => {
    render(
      <SegmentedControl
        label="Filter by type"
        segments={segments}
        value="all"
        onChange={() => {}}
      />,
    );

    const segment = screen.getByRole("button", { name: "skills" });
    expect(segment).toHaveClass("font-ui");
    expect(segment).not.toHaveClass("font-mono");
  });

  it("marks the active segment as pressed and the others as not", () => {
    render(
      <SegmentedControl
        label="Filter by type"
        segments={segments}
        value="skill"
        onChange={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "skills" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "all" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("calls onChange with a segment's value when it is clicked", async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Filter by type"
        segments={segments}
        value="all"
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "skills" }));

    expect(onChange).toHaveBeenCalledWith("skill");
  });

  it("names the group for assistive tech", () => {
    render(
      <SegmentedControl
        label="Filter by type"
        segments={segments}
        value="all"
        onChange={() => {}}
      />,
    );

    expect(
      screen.getByRole("group", { name: "Filter by type" }),
    ).toBeInTheDocument();
  });
});
