import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RegisterRepoHint } from "./register-repo-hint";

describe("RegisterRepoHint", () => {
  it("states the empty registry and names where a repo is registered", () => {
    const { container } = render(<RegisterRepoHint />);

    expect(container.textContent).toBe(
      "No repositories registered. Select Register repository on the Repositories screen to register one.",
    );
  });

  it("offers nothing to click", () => {
    // ADR-0015 rejected a second registration control: Register repository on
    // the Repositories screen stays the only one, so this line must never grow
    // a button or a link.
    render(<RegisterRepoHint />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
