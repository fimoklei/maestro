import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RegisterRepoHint } from "./register-repo-hint";

describe("RegisterRepoHint", () => {
  it("states the empty registry and names where a repo is registered", () => {
    render(<RegisterRepoHint />);

    expect(
      screen.getByText(
        "No repositories registered yet — add one with + repo in the sidebar.",
      ),
    ).toBeInTheDocument();
  });

  it("offers nothing to click", () => {
    // ADR-0015 rejected a second registration control: `+ repo` in the sidebar
    // stays the only one, so this line must never grow a button or a link.
    render(<RegisterRepoHint />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
