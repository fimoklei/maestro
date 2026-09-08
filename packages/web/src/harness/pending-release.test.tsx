import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PendingRelease } from "./pending-release";

describe("PendingRelease", () => {
  it("names each moved skill with what happened to it and who did it", () => {
    render(
      <PendingRelease
        movements={[
          { kind: "added", name: "research", author: "Grace" },
          { kind: "changed", name: "tdd", author: "Ada" },
        ]}
      />,
    );

    const added = screen.getByRole("row", { name: /research/ });
    expect(added).toHaveTextContent("Grace");
    expect(screen.getByRole("row", { name: /tdd/ })).toHaveTextContent("Ada");
    expect(
      screen.getByRole("heading", { level: 3, name: /pending release/i }),
    ).toBeInTheDocument();
  });

  it("shows a rename as one movement, naming the name it had", () => {
    render(
      <PendingRelease
        movements={[
          {
            kind: "renamed",
            name: "test-first",
            previousName: "tdd",
            author: "Ada",
          },
        ]}
      />,
    );

    expect(screen.getByRole("row", { name: /test-first/ })).toHaveTextContent(
      "tdd",
    );
  });

  it("omits the sections nothing moved into", () => {
    render(
      <PendingRelease
        movements={[{ kind: "removed", name: "grilling", author: "Linus" }]}
      />,
    );

    // "Deleted", never "Removed": remove belongs to deployed copies alone
    // (CONTEXT.md → Harness skill deletion).
    expect(screen.getByText("Deleted")).toBeInTheDocument();
    expect(screen.queryByText("Removed")).not.toBeInTheDocument();
    expect(screen.queryByText("Added")).not.toBeInTheDocument();
    expect(screen.queryByText("Changed")).not.toBeInTheDocument();
    expect(screen.queryByText("Renamed")).not.toBeInTheDocument();
  });

  it("shows nothing at all when nothing merged since the release", () => {
    const { container } = render(<PendingRelease movements={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("says plainly that an author is unknown rather than leaving a gap", () => {
    render(
      <PendingRelease
        movements={[{ kind: "added", name: "research", author: null }]}
      />,
    );

    expect(screen.getByRole("row", { name: /research/ })).toHaveTextContent(
      "Unknown",
    );
  });
});
