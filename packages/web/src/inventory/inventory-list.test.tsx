import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  it("renders skills in a table with type, name, and description columns", () => {
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

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Type" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Name" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Description" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "tdd" })).toBeInTheDocument();
    expect(
      screen.getByRole("cell", { name: "Test-driven development." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "caveman" })).toBeInTheDocument();
  });

  it("shows a data-driven type filter of all plus the types present", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderList(
      <InventoryList primitives={primitives} repos={[]} registryReady />,
    );

    const filter = screen.getByRole("group", { name: /filter by type/i });
    expect(filter).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "all" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "skills" })).toBeInTheDocument();
    // Skills-only data yields exactly all + skills, never a hardcoded five.
    expect(
      screen.queryByRole("button", { name: "hooks" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the skills visible and marks the segment active when selected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderList(
      <InventoryList primitives={primitives} repos={[]} registryReady />,
    );

    await userEvent.click(screen.getByRole("button", { name: "skills" }));

    expect(screen.getByRole("button", { name: "skills" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("cell", { name: "tdd" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "caveman" })).toBeInTheDocument();
  });

  it("shows the explicit empty state instead of a blank table", () => {
    renderList(<InventoryList primitives={[]} repos={[]} registryReady />);

    expect(
      screen.getByText("No skills found in the inventory."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

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
