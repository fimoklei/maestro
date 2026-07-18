import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { RegisterRepoForm } from "./register-repo-form";

// The path is a controlled prop; this harness owns it the way a container
// (SidebarRegister, WizardReposView) does.
function ControlledForm({
  onSubmit,
  onBrowse,
  error,
  isPending,
}: {
  onSubmit?: (path: string) => void;
  onBrowse?: () => void;
  error?: string | null;
  isPending?: boolean;
}) {
  const [path, setPath] = useState("");
  return (
    <RegisterRepoForm
      path={path}
      onPathChange={setPath}
      onSubmit={onSubmit ?? vi.fn()}
      onBrowse={onBrowse}
      error={error}
      isPending={isPending}
    />
  );
}

describe("RegisterRepoForm", () => {
  it("renders a labelled path input and a submit button", () => {
    render(<ControlledForm />);

    expect(screen.getByLabelText(/repo path/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /register/i }),
    ).toBeInTheDocument();
  });

  it("submits the typed path to onSubmit", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<ControlledForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/repo path/i), "/Users/me/project");
    await user.click(screen.getByRole("button", { name: /register/i }));

    expect(onSubmit).toHaveBeenCalledWith("/Users/me/project");
  });

  it("renders error text tied to the path field", () => {
    render(<ControlledForm error="Path must be an absolute path." />);

    const input = screen.getByLabelText(/repo path/i);
    const alert = screen.getByRole("alert");

    expect(alert).toHaveTextContent("Path must be an absolute path.");
    expect(input).toHaveAttribute("aria-describedby", alert.id);
  });

  it("shows a browse button only when onBrowse is provided", () => {
    const onBrowse = vi.fn();
    const { rerender } = render(<ControlledForm onBrowse={onBrowse} />);

    expect(screen.getByRole("button", { name: /browse/i })).toBeInTheDocument();

    rerender(<ControlledForm />);
    expect(
      screen.queryByRole("button", { name: /browse/i }),
    ).not.toBeInTheDocument();
  });

  it("closes the browse route while a registration is in flight", () => {
    // Reopening the picker mid-run would start a second registration loop
    // alongside the first, interleaving their outcomes (issue #151).
    render(<ControlledForm onBrowse={vi.fn()} isPending />);

    expect(screen.getByRole("button", { name: /browse/i })).toBeDisabled();
  });
});
