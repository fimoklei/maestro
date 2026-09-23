import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useNarrowerThan } from "./use-narrower-than";

let report: (width: number) => void = () => {};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useNarrowerThan", () => {
  it("follows the element's width across the threshold", () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          report = (width) =>
            callback(
              [{ contentRect: { width } } as ResizeObserverEntry],
              this as unknown as ResizeObserver,
            );
        }
        observe() {}
        disconnect() {}
      },
    );
    const { result } = renderHook(() => useNarrowerThan(1008));
    act(() => result.current.ref(document.createElement("div")));

    act(() => report(820));
    expect(result.current.narrow).toBe(true);
    act(() => report(1180));
    expect(result.current.narrow).toBe(false);
  });
});
