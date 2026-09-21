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

  it("leaves the focus ring to the one rule every control shares", () => {
    // ADR-0033 §2 puts the ring on blue 9 in a single :focus-visible rule
    // (theme.css). A per-button outline utility would override it for buttons
    // alone; outline-none would kill it outright.
    render(<Button>go</Button>);
    const button = screen.getByRole("button", { name: "go" });
    expect(button.className).not.toMatch(/outline/);
  });

  it("keeps the smallest size at the 24px click-target floor", () => {
    // A control inside a row is 24px (ADR-0033 §7), which is also WCAG 2.2 AA
    // 2.5.8's floor — it may not shrink below it.
    render(<Button size="sm">+ repo</Button>);
    expect(screen.getByRole("button", { name: "+ repo" })).toHaveClass("h-6");
  });

  it("keeps an icon-sized button square at the 32px control height", () => {
    render(<Button size="icon" aria-label="Re-read Inventory" />);
    expect(
      screen.getByRole("button", { name: "Re-read Inventory" }),
    ).toHaveClass("h-8", "w-8");
  });

  describe("wrapping", () => {
    it("keeps its label on one line by default", () => {
      render(<Button>deploy →</Button>);
      expect(screen.getByRole("button", { name: "deploy →" })).toHaveClass(
        "whitespace-nowrap",
      );
    });

    it("drops that default when the caller names its own wrapping", () => {
      // cn concatenates, so both would ship and the base one would win by
      // stylesheet order — pushing a sentence-long label out of its column.
      render(<Button className="whitespace-normal">a long sentence</Button>);
      expect(
        screen.getByRole("button", { name: "a long sentence" }),
      ).not.toHaveClass("whitespace-nowrap");
    });
  });

  describe("busy state", () => {
    it("shows the spinner beside the busy label it was given", () => {
      render(<Button busy>Deploying…</Button>);
      const button = screen.getByRole("button", { name: "Deploying…" });
      expect(button).toHaveAttribute("aria-busy", "true");
      expect(button.querySelector("[data-spinner]")).not.toBeNull();
    });

    it("does not fire onClick while busy", async () => {
      const onClick = vi.fn();
      render(
        <Button busy onClick={onClick}>
          Deploying…
        </Button>,
      );
      await userEvent.click(screen.getByRole("button", { name: "Deploying…" }));
      expect(onClick).not.toHaveBeenCalled();
    });

    it("carries no spinner when it is not busy", () => {
      render(<Button>Deploy skill</Button>);
      expect(
        screen
          .getByRole("button", { name: "Deploy skill" })
          .querySelector("[data-spinner]"),
      ).toBeNull();
    });
  });

  describe("disabled state", () => {
    const variants = [
      "primary",
      "success",
      "ghost",
      "quiet",
      "dashed",
      "danger",
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
