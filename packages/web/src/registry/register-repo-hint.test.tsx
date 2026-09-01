import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RegisterRepoHint } from "./register-repo-hint";

describe("RegisterRepoHint", () => {
  it("states the empty registry and names where a repo is registered", () => {
    const { container } = render(<RegisterRepoHint />);

    expect(container.textContent).toBe(
      "No repositories registered. Select + repo in the sidebar to register one.",
    );
  });

  it("sets the control label in mono, the way the sidebar button renders it", () => {
    // DESIGN.md §3, the Mono-Is-Data Rule: an action label is mono, so the
    // sentence must not flatten `+ repo` into the surrounding sans.
    render(<RegisterRepoHint />);

    expect(screen.getByText("+ repo")).toHaveClass("font-mono");
  });

  it("offers nothing to click", () => {
    // ADR-0015 rejected a second registration control: `+ repo` in the sidebar
    // stays the only one, so this line must never grow a button or a link.
    render(<RegisterRepoHint />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
