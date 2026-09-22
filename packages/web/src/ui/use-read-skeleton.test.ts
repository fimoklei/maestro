import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReadSkeleton } from "./use-read-skeleton";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function renderSkeleton(reading: boolean) {
  return renderHook(({ reading }) => useReadSkeleton(reading), {
    initialProps: { reading },
  });
}

describe("useReadSkeleton", () => {
  it("shows nothing for a read that answers inside 1.3 s", () => {
    const { result, rerender } = renderSkeleton(true);

    act(() => vi.advanceTimersByTime(1200));
    expect(result.current.visible).toBe(false);

    rerender({ reading: false });
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.visible).toBe(false);
  });

  it("shows the skeleton once a read passes 1.3 s", () => {
    const { result } = renderSkeleton(true);

    act(() => vi.advanceTimersByTime(1299));
    expect(result.current.visible).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.visible).toBe(true);
  });

  it("holds a shown skeleton for at least 0.5 s after the answer", () => {
    const { result, rerender } = renderSkeleton(true);
    act(() => vi.advanceTimersByTime(1300));

    act(() => vi.advanceTimersByTime(100));
    rerender({ reading: false });
    expect(result.current.visible).toBe(true);

    act(() => vi.advanceTimersByTime(399));
    expect(result.current.visible).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.visible).toBe(false);
  });

  it("hides at once when the skeleton has already stood 0.5 s", () => {
    const { result, rerender } = renderSkeleton(true);
    act(() => vi.advanceTimersByTime(2000));

    rerender({ reading: false });

    expect(result.current.visible).toBe(false);
  });

  it("shows the skeleton at once for a pressed re-read and holds it 0.5 s", () => {
    const { result, rerender } = renderSkeleton(false);

    act(() => result.current.press());
    rerender({ reading: true });
    expect(result.current.visible).toBe(true);

    rerender({ reading: false });
    act(() => vi.advanceTimersByTime(499));
    expect(result.current.visible).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.visible).toBe(false);
  });
});
