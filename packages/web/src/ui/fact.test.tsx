import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Fact } from "./fact";

describe("Fact", () => {
  it("names the value with the label above it", () => {
    render(
      <dl>
        <Fact label="Branch" value="main" />
      </dl>,
    );

    expect(screen.getByText("Branch").tagName).toBe("DT");
    expect(screen.getByText("main").tagName).toBe("DD");
  });

  // A full tree hash and a full commit are both too long for their column;
  // one of the two used to run off the panel (#752).
  it("wraps a value that cannot fit its column", () => {
    render(
      <dl>
        <Fact label="Revision" value="9f1c2b" wrap />
      </dl>,
    );

    expect(screen.getByText("9f1c2b")).toHaveClass("break-all");
  });

  it("sets its label in the sans face, as written", () => {
    render(
      <dl>
        <Fact label="Previous tag" value="v1.2.3" />
      </dl>,
    );

    const label = screen.getByText("Previous tag");
    expect(label).toHaveClass("font-ui");
    expect(label).not.toHaveClass("font-mono");
    expect(label).not.toHaveClass("uppercase");
  });

  it("leaves a short value unwrapped", () => {
    render(
      <dl>
        <Fact label="Branch" value="main" />
      </dl>,
    );

    expect(screen.getByText("main")).not.toHaveClass("break-all");
  });
});
