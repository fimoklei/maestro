import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InventoryList } from "./inventory-list";
import type { Primitive } from "./use-inventory";

afterEach(() => {
  vi.unstubAllGlobals();
});

const primitives: Primitive[] = [
  { type: "skill", name: "tdd", description: "Test-driven development." },
  { type: "skill", name: "caveman", description: "Terse mode." },
];

function renderList(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("InventoryList", () => {
  it("names where repos are registered when the loaded registry has none", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderList(
      <InventoryList primitives={primitives} repos={[]} registryReady />,
    );

    // Once for the whole list, not once per row: a 36-skill inventory would
    // otherwise print the same sentence 36 times.
    expect(
      screen.getAllByText(/consuming repos are registered via/i),
    ).toHaveLength(1);
  });

  it("hides the hint while the registry is still unread", () => {
    // An unread registry yields the same empty list as a genuinely empty one,
    // so claiming "none registered" before it resolves would be a guess (#37).
    vi.stubGlobal("fetch", vi.fn());
    renderList(
      <InventoryList
        primitives={primitives}
        repos={[]}
        registryReady={false}
      />,
    );

    expect(
      screen.queryByText(/consuming repos are registered via/i),
    ).not.toBeInTheDocument();
  });

  it("hides the hint once a repo is registered", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderList(
      <InventoryList
        primitives={primitives}
        repos={[{ path: "/projects/alpha" }]}
        registryReady
      />,
    );

    expect(
      screen.queryByText(/consuming repos are registered via/i),
    ).not.toBeInTheDocument();
  });
});
