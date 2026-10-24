import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("states the heading at its level, then what appears here", () => {
    render(
      <EmptyState
        headingLevel={2}
        title="No repositories yet"
        description="Repositories appear here."
      />,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "No repositories yet" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Repositories appear here.")).toBeInTheDocument();
  });

  it("repeats the screen's action where the reader is looking", async () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        headingLevel={2}
        title="No repositories yet"
        description="Repositories appear here."
        action={<Button onClick={onClick}>Register repository</Button>}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Register repository" }),
    );

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("keeps its icon out of the accessible tree", () => {
    const { container } = render(
      <EmptyState
        headingLevel={2}
        title="No repositories yet"
        description="Repositories appear here."
        icon={<svg data-testid="icon" />}
      />,
    );

    expect(screen.getByTestId("icon").parentElement).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(container).toHaveTextContent(
      "No repositories yetRepositories appear here.",
    );
  });
});
