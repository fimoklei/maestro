import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SectionHeader } from "./section-header";

describe("SectionHeader", () => {
  it("renders the title as a heading", () => {
    render(<SectionHeader title="Deploy-state" meta="3 targets" />);

    expect(
      screen.getByRole("heading", { name: "Deploy-state" }),
    ).toBeInTheDocument();
    expect(screen.getByText("3 targets")).toBeInTheDocument();
  });
});
