import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectTooltipCause } from "./test-utils";
import { GatedButton } from "./ui/gated-button";

describe("expectTooltipCause", () => {
  it("passes for a blocked control whose tooltip states the cause", () => {
    render(
      <GatedButton label="Delete skill" unavailable="Checking your clone…" />,
    );

    expect(() =>
      expectTooltipCause(
        screen.getByRole("button", { name: "Delete skill" }),
        "Checking your clone…",
      ),
    ).not.toThrow();
  });

  it("fails when the tooltip states another cause", () => {
    render(
      <GatedButton label="Delete skill" unavailable="Checking your clone…" />,
    );

    expect(() =>
      expectTooltipCause(
        screen.getByRole("button", { name: "Delete skill" }),
        "No Harness connected.",
      ),
    ).toThrow();
  });

  it("fails when the control is not blocked", () => {
    render(<GatedButton label="Delete skill" unavailable={null} />);

    expect(() =>
      expectTooltipCause(
        screen.getByRole("button", { name: "Delete skill" }),
        "Checking your clone…",
      ),
    ).toThrow(/aria-disabled/);
  });

  it("fails when the control has no cause", () => {
    render(
      <button type="button" aria-disabled="true">
        Delete skill
      </button>,
    );

    expect(() =>
      expectTooltipCause(
        screen.getByRole("button", { name: "Delete skill" }),
        "Checking your clone…",
      ),
    ).toThrow(/no cause/);
  });

  it("fails when the cause is text drawn on the page", () => {
    render(
      <>
        <button type="button" aria-disabled="true" aria-describedby="cause">
          Delete skill
        </button>
        <p id="cause">Checking your clone…</p>
      </>,
    );

    expect(() =>
      expectTooltipCause(
        screen.getByRole("button", { name: "Delete skill" }),
        "Checking your clone…",
      ),
    ).toThrow(/drawn on the page/);
  });
});
