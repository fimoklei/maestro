import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { expectDescription, shownTooltip } from "../test-utils";
import { link, machine, phrase } from "./phrase";
import { Tooltip } from "./tooltip";
import { useDismiss } from "./use-dismiss";

function Panel({ onClose }: { onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useDismiss({ containerRef, onClose });
  return (
    <div ref={containerRef}>
      <Tooltip label="Local edits">
        <button type="button">✎</button>
      </Tooltip>
    </div>
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

  it("sets a path in the reason in mono and describes the trigger in plain words", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip
        label="Missing"
        detail={phrase`No copy in ${machine("~/.agents/skills")}.`}
      >
        <button type="button" aria-label="Missing">
          ⚠
        </button>
      </Tooltip>,
    );

    await user.tab();

    expect(
      within(await shownTooltip()).getByText("~/.agents/skills"),
    ).toHaveClass("font-mono");
    expectDescription(
      screen.getByRole("button", { name: "Missing" }),
      "No copy in ~/.agents/skills.",
    );
  });

  it("keeps a link in the reason as plain words: the tooltip holds no control", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip
        label="Behind"
        detail={phrase`See ${link("Skills", { pathname: "/skills", state: null })}.`}
      >
        <button type="button" aria-label="Behind">
          ↓
        </button>
      </Tooltip>,
    );

    await user.tab();

    const tooltip = await shownTooltip();
    expect(within(tooltip).getByText(/See Skills/)).toBeInTheDocument();
    expect(tooltip.querySelector("a")).toBeNull();
  });
});
