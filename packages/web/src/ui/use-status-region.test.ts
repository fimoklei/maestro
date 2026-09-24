import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useStatusRegion } from "./use-status-region";

function renderRegion(read: string) {
  return renderHook(({ read }) => useStatusRegion(read), {
    initialProps: { read },
  });
}

describe("useStatusRegion", () => {
  it("says the read until a write starts", () => {
    const { result } = renderRegion("Inventory loaded.");

    expect(result.current[0]).toBe("Inventory loaded.");
    act(() => result.current[1]("Deploying…"));
    expect(result.current[0]).toBe("Deploying…");
  });

  // A cleared write means its notice or toast said the end. Falling back to
  // the old read would announce "Inventory loaded." after a failed deploy.
  it("stays silent after a write clears, never repeating an old read", () => {
    const { result } = renderRegion("Inventory loaded.");

    act(() => result.current[1]("Deploying…"));
    act(() => result.current[1](""));
    expect(result.current[0]).toBe("");
  });

  it("lets a newer read replace an earlier write", () => {
    const { result, rerender } = renderRegion("Inventory loaded.");

    act(() => result.current[1]("Deployed tdd."));
    rerender({ read: "Loading the Inventory…" });
    expect(result.current[0]).toBe("Loading the Inventory…");
  });
});
