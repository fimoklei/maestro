import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { useDismiss } from "./use-dismiss";

function Panel({
  onClose,
  closeEnabled = true,
}: {
  onClose: () => void;
  closeEnabled?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useDismiss({ containerRef, onClose, closeEnabled });
  return <div ref={containerRef} />;
}

describe("useDismiss", () => {
  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<Panel onClose={onClose} />);

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("gives Escape to only the most recently opened panel when two are stacked", async () => {
    const bottomClose = vi.fn();
    const topClose = vi.fn();
    render(
      <>
        <Panel onClose={bottomClose} />
        <Panel onClose={topClose} />
      </>,
    );

    await userEvent.keyboard("{Escape}");

    expect(topClose).toHaveBeenCalledOnce();
    expect(bottomClose).not.toHaveBeenCalled();
  });

  it("blocks Escape entirely while the topmost panel can't close yet, instead of falling through", async () => {
    const bottomClose = vi.fn();
    const topClose = vi.fn();
    render(
      <>
        <Panel onClose={bottomClose} />
        <Panel onClose={topClose} closeEnabled={false} />
      </>,
    );

    await userEvent.keyboard("{Escape}");

    expect(topClose).not.toHaveBeenCalled();
    expect(bottomClose).not.toHaveBeenCalled();
  });

  // A ⋮ menu inside a detail pane (#1065): its Escape closes the menu alone.
  it("leaves an Escape typed in an open menu to that menu", async () => {
    const onClose = vi.fn();
    const { getByRole } = render(
      <>
        <Panel onClose={onClose} />
        <div role="menu">
          <button type="button" role="menuitem">
            Remove from target
          </button>
        </div>
      </>,
    );

    getByRole("menuitem").focus();
    await userEvent.keyboard("{Escape}");

    expect(onClose).not.toHaveBeenCalled();
  });

  it("hands Escape back to the panel underneath once the top one unmounts", async () => {
    const bottomClose = vi.fn();
    const topClose = vi.fn();
    const { rerender } = render(
      <>
        <Panel onClose={bottomClose} />
        <Panel onClose={topClose} />
      </>,
    );

    rerender(<Panel onClose={bottomClose} />);
    await userEvent.keyboard("{Escape}");

    expect(bottomClose).toHaveBeenCalledOnce();
    expect(topClose).not.toHaveBeenCalled();
  });

  it("gives an outside press to only the most recently opened panel", async () => {
    const bottomClose = vi.fn();
    const topClose = vi.fn();
    render(
      <>
        <Panel onClose={bottomClose} />
        <Panel onClose={topClose} />
      </>,
    );

    await userEvent.click(document.body);

    expect(topClose).toHaveBeenCalledOnce();
    expect(bottomClose).not.toHaveBeenCalled();
  });
});
