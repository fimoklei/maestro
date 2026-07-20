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

  // A view is a section of the cockpit, so its title ranks below the document.
  it("ranks a view title at level 2 by default", () => {
    render(<SectionHeader title="Deploy-state" />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Deploy-state" }),
    ).toBeInTheDocument();
  });

  it("ranks a heading inside a view below the view title", () => {
    render(<SectionHeader level={3} title="Global targets" />);

    expect(
      screen.getByRole("heading", { level: 3, name: "Global targets" }),
    ).toBeInTheDocument();
  });

  // The connect gate is its own document rather than a section of one
  // (ADR-0015).
  it("ranks a standalone screen title at level 1", () => {
    render(<SectionHeader level={1} title="Connect central inventory" />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Connect central inventory",
      }),
    ).toBeInTheDocument();
  });
});
