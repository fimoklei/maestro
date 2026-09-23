import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useEscapeToClose } from "./use-escape-to-close";

function EscapePanel({
  onClose,
  closeEnabled = true,
}: {
  onClose: () => void;
  closeEnabled?: boolean;
}) {
  useEscapeToClose({ onClose, closeEnabled });
  return null;
}

describe("useEscapeToClose", () => {
  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<EscapePanel onClose={onClose} />);

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("gives Escape to only the most recently opened panel when two are stacked", async () => {
    // Two panels can be open at once, each mounting its own useEscapeToClose.
    // Both used to register an independent document listener, so one Escape
    // closed both; only the topmost should react.
    const bottomClose = vi.fn();
    const topClose = vi.fn();
    render(
      <>
        <EscapePanel onClose={bottomClose} />
        <EscapePanel onClose={topClose} />
      </>,
    );

    await userEvent.keyboard("{Escape}");

    expect(topClose).toHaveBeenCalledOnce();
    expect(bottomClose).not.toHaveBeenCalled();
  });

  it("blocks Escape entirely while the topmost panel can't close yet, instead of falling through", async () => {
    // A dialog disables closing while its action runs. That must not leave
    // Escape free to fall through and close whatever is stacked underneath it.
    const bottomClose = vi.fn();
    const topClose = vi.fn();
    render(
      <>
        <EscapePanel onClose={bottomClose} />
        <EscapePanel onClose={topClose} closeEnabled={false} />
      </>,
    );

    await userEvent.keyboard("{Escape}");

    expect(topClose).not.toHaveBeenCalled();
    expect(bottomClose).not.toHaveBeenCalled();
  });

  it("hands Escape back to the panel underneath once the top one unmounts", async () => {
    const bottomClose = vi.fn();
    const topClose = vi.fn();
    const { rerender } = render(
      <>
        <EscapePanel onClose={bottomClose} />
        <EscapePanel onClose={topClose} />
      </>,
    );

    rerender(<EscapePanel onClose={bottomClose} />);
    await userEvent.keyboard("{Escape}");

    expect(bottomClose).toHaveBeenCalledOnce();
    expect(topClose).not.toHaveBeenCalled();
  });
});
