import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Panel } from "./panel";

describe("Panel", () => {
  it("names the screen once, as its level-1 heading", () => {
    render(<Panel title="Deploy-state">rows</Panel>);

    expect(
      screen.getByRole("heading", { level: 1, name: "Deploy-state" }),
    ).toBeInTheDocument();
  });

  it("puts the screen's primary action in band 1, beside the title", () => {
    render(
      <Panel
        title="Repositories"
        action={<button type="button">Register repository</button>}
      >
        rows
      </Panel>,
    );

    const band = screen
      .getByRole("heading", { level: 1, name: "Repositories" })
      .closest("div");
    expect(band).not.toBeNull();
    expect(screen.getByRole("button", { name: "Register repository" })).toBe(
      band?.querySelector("button"),
    );
  });

  it("states the screen's own count beside the title", () => {
    render(
      <Panel title="Inventory" meta="9 skills">
        rows
      </Panel>,
    );

    expect(screen.getByText("9 skills")).toBeInTheDocument();
  });

  it("draws no second band on a screen with nothing to put in it", () => {
    // A band with nothing to show is not rendered; the panel then has one
    // band (#991).
    const { container } = render(<Panel title="Harness">rows</Panel>);

    expect(container.querySelectorAll("[data-band]")).toHaveLength(1);
  });

  it("draws the second band when the screen fills it", () => {
    const { container } = render(
      <Panel title="Harness" band2={<span>Read just now</span>}>
        rows
      </Panel>,
    );

    expect(container.querySelectorAll("[data-band]")).toHaveLength(2);
    expect(screen.getByText("Read just now")).toBeInTheDocument();
  });

  it("scrolls its content alone, so both bands stay in reach", () => {
    render(<Panel title="Inventory">rows</Panel>);

    expect(screen.getByTestId("panel-content")).toHaveClass("overflow-y-auto");
  });
});
