import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Notice } from "./notice";

describe("Notice", () => {
  it("renders no glyph for info, so nothing reads as a fault", () => {
    render(
      <Notice
        trigger="load"
        notice={{
          level: "info",
          label: "no global tools",
          message: "Install Claude Code or Codex to deploy skills globally.",
        }}
      />,
    );

    const region = screen.getByRole("status");
    expect(region).toHaveTextContent("no global tools");
    expect(region.textContent).not.toMatch(/[✕⚠✓]/);
  });

  // The tint is proven in a browser, never here: happy-dom renders without CSS.
  it.each([
    ["success", "✓"],
    ["warning", "⚠"],
    ["error", "✕"],
  ] as const)("marks %s with its own glyph", (level, glyph) => {
    render(
      <Notice
        trigger="load"
        notice={{
          level,
          label: "a heading",
          message: "a sentence.",
          action: { label: "act", onClick: vi.fn() },
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(glyph);
  });

  // The assertive region is earned, never chosen: only a level that says
  // something is wrong, and only after the user acted.
  describe("the live-region role", () => {
    const roleOf = (
      level: "info" | "success" | "warning" | "error",
      trigger: "load" | "user-action",
    ) => {
      const { unmount } = render(
        <Notice
          trigger={trigger}
          notice={{
            level,
            label: "a heading",
            message: "a sentence.",
            action: { label: "act", onClick: vi.fn() },
          }}
        />,
      );
      const role = screen
        .getByText("a heading")
        .closest("[role]")
        ?.getAttribute("role");
      unmount();
      return role;
    };

    it("is alert only for warning or error after a user action", () => {
      expect(roleOf("warning", "user-action")).toBe("alert");
      expect(roleOf("error", "user-action")).toBe("alert");
    });

    it("is status for anything that appeared on load", () => {
      expect(roleOf("warning", "load")).toBe("status");
      expect(roleOf("error", "load")).toBe("status");
    });

    it("is status for a level that states no fault", () => {
      expect(roleOf("info", "user-action")).toBe("status");
      expect(roleOf("success", "user-action")).toBe("status");
    });
  });

  // A live region that arrives together with its own content is announced
  // unreliably, and the whole role matrix rests on that announcement firing.
  it("keeps the region in the document while there is nothing to say", () => {
    const { container } = render(
      <Notice trigger="user-action" notice={null} id="notice-1" />,
    );

    const region = container.querySelector("#notice-1");
    expect(region).not.toBeNull();
    expect(region).toHaveAttribute("aria-live");
    expect(region).toBeEmptyDOMElement();
  });

  // The two halves of "a failure states itself and stays" (ADR-0033 §5): the
  // reader is never interrupted, and never loses the message by waiting.
  it("never moves focus to itself", () => {
    render(
      <Notice
        trigger="user-action"
        notice={{
          level: "error",
          label: "Could not read Inventory",
          message: "Select Re-read Inventory to try again.",
        }}
      />,
    );

    expect(document.activeElement).toBe(document.body);
  });

  it("is still on screen long after a toast would have gone", () => {
    vi.useFakeTimers();
    try {
      render(
        <Notice
          trigger="user-action"
          notice={{
            level: "error",
            label: "Could not read Inventory",
            message: "Select Re-read Inventory to try again.",
          }}
        />,
      );

      vi.advanceTimersByTime(60_000);

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Could not read Inventory",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("wires a form field's aria-describedby through id", () => {
    render(
      <Notice
        id="path-error"
        trigger="user-action"
        notice={{
          level: "error",
          label: "not a folder",
          message: "That path is a file.",
        }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveAttribute("id", "path-error");
  });

  describe("the action", () => {
    it("fires what the caller passed", async () => {
      const onClick = vi.fn();
      render(
        <Notice
          trigger="user-action"
          notice={{
            level: "error",
            label: "the removal failed",
            message: "apm did not confirm the removal.",
            action: { label: "retry", onClick },
          }}
        />,
      );

      await userEvent.click(screen.getByRole("button", { name: "retry" }));

      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("stays inert while it is disabled", async () => {
      const onClick = vi.fn();
      render(
        <Notice
          trigger="user-action"
          notice={{
            level: "error",
            label: "the removal failed",
            message: "apm did not confirm the removal.",
            action: { label: "retry", onClick, disabled: true },
          }}
        />,
      );

      const button = screen.getByRole("button", { name: "retry" });
      expect(button).toBeDisabled();
      await userEvent.click(button);
      expect(onClick).not.toHaveBeenCalled();
    });

    it("renders no control when the level offers none", () => {
      render(
        <Notice
          trigger="user-action"
          notice={{
            level: "error",
            label: "can't be removed",
            message: "That repo is not registered with Maestro.",
          }}
        />,
      );

      expect(screen.queryByRole("button")).toBeNull();
    });
  });

  // A notice inside a table cell is not a panel: a filled, outlined box in a
  // row is a card inside a card (DESIGN.md § Notice). The
  // tint of the rule that replaces it is proven in a browser, never here.
  describe("the inline variant", () => {
    const regionOf = (variant: "block" | "inline") => {
      const { unmount } = render(
        <Notice
          variant={variant}
          trigger="load"
          notice={{
            level: "error",
            label: "a heading",
            message: "a sentence.",
          }}
        />,
      );
      const className = screen.getByRole("status").className;
      unmount();
      return className;
    };

    it("drops the panel's fill, outline and corner", () => {
      const inline = regionOf("inline");
      expect(inline).not.toMatch(/\bbg-/);
      expect(inline).not.toMatch(/\brounded-control\b/);
      expect(inline).not.toMatch(/(^|\s)border(\s|$)/);
    });

    it("keeps a 1px rule so the notice still reads as its own aside", () => {
      expect(regionOf("inline")).toMatch(/\bborder-l\b/);
    });

    it("is the panel by default, for every notice outside a row", () => {
      const block = regionOf("block");
      expect(block).toMatch(/\bbg-/);
      expect(block).toMatch(/\brounded-control\b/);
    });
  });

  // Why this happened, below the sentence and never collapsed — at every
  // level, so no level hides its cause behind a disclosure.
  it.each(["info", "success", "warning", "error"] as const)(
    "renders the detail of a %s notice below its sentence",
    (level) => {
      render(
        <Notice
          trigger="load"
          notice={{
            level,
            label: "a heading",
            message: "a sentence.",
            detail: "The cause, in one sentence.",
            action: { label: "act", onClick: vi.fn() },
          }}
        />,
      );

      const detail = screen.getByText("The cause, in one sentence.");
      expect(screen.getByRole("status")).toContainElement(detail);
      expect(detail.previousElementSibling).toHaveTextContent("a sentence.");
    },
  );
});
