import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FactList, FactRow } from "./fact-list";

describe("FactList", () => {
  it("names each value with its label beside it, one row per fact", () => {
    render(
      <FactList size="row">
        <FactRow label="Kind">Repository</FactRow>
        <FactRow label="Release" machine>
          v0.3.4
        </FactRow>
      </FactList>,
    );

    const list = screen.getByText("Kind").closest("dl");
    expect(list).toHaveClass("grid-cols-[auto_1fr]");
    expect(screen.getByText("Kind").tagName).toBe("DT");
    expect(screen.getByText("Repository").tagName).toBe("DD");
    expect(screen.getByText("Kind").nextElementSibling).toBe(
      screen.getByText("Repository"),
    );
  });

  it("sets its facts at the size of the surface it sits on", () => {
    render(
      <>
        <FactList size="row">
          <FactRow label="In the pane">Repository</FactRow>
        </FactList>
        <FactList size="meta">
          <FactRow label="In a card">Repository</FactRow>
        </FactList>
      </>,
    );

    const pane = screen.getByText("In the pane").closest("dl");
    const card = screen.getByText("In a card").closest("dl");
    expect(pane).toHaveClass("text-row");
    expect(card).toHaveClass("text-meta");
    expect(card).not.toHaveClass("text-row");
  });

  it("sets a machine value in mono and a plain word in the sans face", () => {
    render(
      <FactList size="row">
        <FactRow label="Kind">Repository</FactRow>
        <FactRow label="Release" machine>
          v0.3.4
        </FactRow>
      </FactList>,
    );

    expect(screen.getByText("v0.3.4")).toHaveClass("font-mono");
    expect(screen.getByText("Repository")).not.toHaveClass("font-mono");
    for (const label of ["Kind", "Release"]) {
      const dt = screen.getByText(label);
      expect(dt).toHaveClass("text-gray-11", "text-meta");
      expect(dt).not.toHaveClass("font-mono");
      expect(dt).not.toHaveClass("uppercase");
    }
  });

  // #1123: the whole value opens from the keyboard too, not only on hover.
  it("shows the whole value in a tooltip on focus where the row shortens it", async () => {
    const user = userEvent.setup();
    render(
      <FactList size="row">
        <FactRow label="Path" machine fullValue="/Users/me/work/api">
          /Users/me/work/api
        </FactRow>
      </FactList>,
    );

    await user.tab();

    expect(
      await screen.findByRole("tooltip", { hidden: true }),
    ).toHaveTextContent("/Users/me/work/api");
    // One place states the whole value: no native title beside the tooltip.
    expect(document.querySelector("[title]")).toBeNull();
  });

  it("carries one control beside a fact's value", () => {
    render(
      <FactList size="row">
        <FactRow
          label="Latest release"
          machine
          action={<button type="button">Update target</button>}
        >
          v0.3.4
        </FactRow>
      </FactList>,
    );

    const value = screen.getByText("Latest release").nextElementSibling;
    expect(value).toHaveTextContent("v0.3.4");
    expect(
      screen.getByRole("definition").querySelector("button"),
    ).toHaveTextContent("Update target");
  });
});
