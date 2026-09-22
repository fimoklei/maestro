import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("states what is empty, what appears here and the one way to fill it", () => {
    render(
      <EmptyState
        title="No changes yet"
        body="Skills you import or edit in your clone will appear here."
        action={<Button>Import skill…</Button>}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "No changes yet" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Skills you import or edit in your clone will appear here.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Import skill…" }),
    ).toBeInTheDocument();
  });
});
