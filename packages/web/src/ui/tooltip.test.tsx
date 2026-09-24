import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Tooltip } from "./tooltip";
import { useEscapeToClose } from "./use-escape-to-close";

function Panel({ onClose }: { onClose: () => void }) {
  useEscapeToClose({ onClose });
  return (
    <Tooltip label="Local edits">
      <button type="button">✎</button>
    </Tooltip>
  );
}

describe("Tooltip", () => {
  it("closes on Escape without closing the panel it sits in", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Panel onClose={onClose} />);

    await user.tab();
    await screen.findByRole("tooltip", { hidden: true });
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("tooltip", { hidden: true })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("adds no description that repeats a label-only tooltip's name", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip label="Behind">
        <button type="button" aria-label="Behind">
          ↓
        </button>
      </Tooltip>,
    );

    await user.tab();
    await screen.findByRole("tooltip", { hidden: true });

    const trigger = screen.getByRole("button", { name: "Behind" });
    expect(trigger).not.toHaveAccessibleDescription();
  });

  it("describes the trigger with the reason alone when there is one", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip label="Local edits" detail="This copy changed">
        <button type="button" aria-label="Local edits">
          ✎
        </button>
      </Tooltip>,
    );

    await user.tab();
    await screen.findByRole("tooltip", { hidden: true });

    expect(
      screen.getByRole("button", { name: "Local edits" }),
    ).toHaveAccessibleDescription("This copy changed");
  });
});
