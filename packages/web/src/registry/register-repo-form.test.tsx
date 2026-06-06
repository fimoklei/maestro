import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RegisterRepoForm } from "./register-repo-form";

describe("RegisterRepoForm", () => {
  it("renders a labelled path input and a submit button", () => {
    render(<RegisterRepoForm onSubmit={vi.fn()} />);

    expect(screen.getByLabelText(/repo path/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /register/i }),
    ).toBeInTheDocument();
  });

  it("submits the typed path to onSubmit", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<RegisterRepoForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/repo path/i), "/Users/me/project");
    await user.click(screen.getByRole("button", { name: /register/i }));

    expect(onSubmit).toHaveBeenCalledWith("/Users/me/project");
  });

  it("renders error text tied to the path field", () => {
    render(
      <RegisterRepoForm
        onSubmit={vi.fn()}
        error="Path must be an absolute path."
      />,
    );

    const input = screen.getByLabelText(/repo path/i);
    const alert = screen.getByRole("alert");

    expect(alert).toHaveTextContent("Path must be an absolute path.");
    expect(input).toHaveAttribute("aria-describedby", alert.id);
  });
});
