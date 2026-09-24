import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FactList, FactRow } from "./fact-list";

describe("FactList", () => {
  it("names each value with its label beside it, one row per fact", () => {
    render(
      <FactList>
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

  // design.md: Geist Mono only for a version, tag, path, ref or hash.
  it("sets a machine value in mono and a plain word in the sans face", () => {
    render(
      <FactList>
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

  it("carries the whole value on hover where the row shortens it", () => {
    render(
      <FactList>
        <FactRow label="Path" machine title="/Users/me/work/api">
          /Users/me/work/api
        </FactRow>
      </FactList>,
    );

    expect(screen.getByText("/Users/me/work/api")).toHaveAttribute(
      "title",
      "/Users/me/work/api",
    );
  });
});
