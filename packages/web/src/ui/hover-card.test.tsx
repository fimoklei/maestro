import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HoverCard } from "./hover-card";

function renderCard(props: { focused?: boolean } = {}) {
  return render(
    <HoverCard content={<p>Deployed to 2 targets</p>} {...props}>
      <span>Up to date</span>
    </HoverCard>,
  );
}

const card = () => screen.queryByText("Deployed to 2 targets");

afterEach(() => {
  vi.useRealTimers();
});

describe("HoverCard", () => {
  it("opens on hover after its 400 ms delay, not at once", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderCard();

    fireEvent.pointerEnter(screen.getByText("Up to date"), {
      pointerType: "mouse",
    });
    act(() => vi.advanceTimersByTime(399));
    expect(card()).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(card()).toBeInTheDocument();
  });

  it("closes 150 ms after the pointer leaves", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderCard();
    const trigger = screen.getByText("Up to date");

    fireEvent.pointerEnter(trigger, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(400));
    fireEvent.pointerLeave(trigger, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(149));
    expect(card()).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(card()).not.toBeInTheDocument();
  });

  it("opens while its owner reports focus, and closes when focus moves on", () => {
    // A grid holds focus itself, so the row tells the card it is focused.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { rerender } = renderCard({ focused: true });

    act(() => vi.advanceTimersByTime(400));
    expect(card()).toBeInTheDocument();

    rerender(
      <HoverCard content={<p>Deployed to 2 targets</p>} focused={false}>
        <span>Up to date</span>
      </HoverCard>,
    );
    act(() => vi.advanceTimersByTime(150));
    expect(card()).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderCard({ focused: true });
    act(() => vi.advanceTimersByTime(400));
    expect(card()).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: "Escape" });

    expect(card()).not.toBeInTheDocument();
  });

  it("opens on a tap, which a touch screen never reports as a hover", () => {
    renderCard();

    fireEvent.pointerUp(screen.getByText("Up to date"), {
      pointerType: "touch",
    });

    expect(card()).toBeInTheDocument();
  });

  it("never takes focus from the element that holds it", async () => {
    render(
      <>
        <button type="button">Before</button>
        <HoverCard content={<p>Deployed to 2 targets</p>} focused>
          <span>Up to date</span>
        </HoverCard>
      </>,
    );
    const before = screen.getByRole("button", { name: "Before" });
    before.focus();

    expect(await screen.findByText("Deployed to 2 targets")).toBeVisible();
    expect(before).toHaveFocus();
    await userEvent.tab();
    expect(before).not.toHaveFocus();
  });
});
