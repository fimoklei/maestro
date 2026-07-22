import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./button";

describe("Button", () => {
  it("renders a real button carrying its label and a default type of button", () => {
    render(<Button>deploy →</Button>);
    const button = screen.getByRole("button", { name: "deploy →" });
    expect(button).toHaveAttribute("type", "button");
  });

  it("calls onClick when activated", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>go</Button>);
    await userEvent.click(screen.getByRole("button", { name: "go" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does not fire onClick while disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        go
      </Button>,
    );
    await userEvent.click(screen.getByRole("button", { name: "go" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("shows a tokenized amber focus-visible ring, not the UA default", () => {
    // The ring lives in the shared base className, not variantClasses, so every
    // variant inherits it — one assertion covers all five (no per-variant loop).
    render(<Button>go</Button>);
    const button = screen.getByRole("button", { name: "go" });
    expect(button).toHaveClass(
      "focus-visible:outline-2",
      "focus-visible:outline-offset-2",
      "focus-visible:outline-amber",
    );
    // outline-none would set --tw-outline-style:none, which outline-2 reads —
    // silently hiding the ring. Guard against a regression that re-adds it.
    expect(button).not.toHaveClass("outline-none");
  });

  describe("disabled state", () => {
    const variants = [
      "primary",
      "success",
      "ghost",
      "quiet",
      "dashed",
    ] as const;

    it.each(variants)(
      "carries the shared dim treatment for the %s variant, never a signal fill",
      (variant) => {
        render(
          <Button variant={variant} disabled>
            go
          </Button>,
        );
        const button = screen.getByRole("button", { name: "go" });
        expect(button).toHaveClass(
          "disabled:cursor-not-allowed",
          "disabled:border-line-chip",
          "disabled:bg-dim-bg",
          "disabled:text-dim",
        );
        expect(button).not.toHaveClass("disabled:bg-amber");
        expect(button).not.toHaveClass("disabled:bg-green");
      },
    );
  });
});
