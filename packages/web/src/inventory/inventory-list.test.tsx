import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InventoryList } from "./inventory-list";
import type { Primitive } from "./use-inventory";

function dataRowNames(): (string | null)[] {
  const [, ...bodyRows] = screen.getAllByRole("row");
  return bodyRows.map(
    (row) => within(row).getAllByRole("cell")[1]?.textContent ?? null,
  );
}

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

  it("narrows the table to skills whose name matches the search text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderList(
      <InventoryList primitives={primitives} repos={[]} registryReady />,
    );

    await userEvent.type(
      screen.getByRole("searchbox", { name: /search/i }),
      "cave",
    );

    expect(screen.getByRole("cell", { name: "caveman" })).toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "tdd" })).not.toBeInTheDocument();
  });

  it("tells the user when the search matches no skills", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderList(
      <InventoryList primitives={primitives} repos={[]} registryReady />,
    );

    await userEvent.type(
      screen.getByRole("searchbox", { name: /search/i }),
      "zzz",
    );

    expect(screen.getByText(/no skills match/i)).toBeInTheDocument();
  });

  it("sorts by name and shows the active sort when the header is clicked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderList(
      <InventoryList primitives={primitives} repos={[]} registryReady />,
    );

    // Loaded order until the user asks for a sort.
    expect(dataRowNames()).toEqual(["tdd", "caveman"]);

    const nameHeader = screen.getByRole("columnheader", { name: /name/i });
    await userEvent.click(within(nameHeader).getByRole("button"));

    expect(dataRowNames()).toEqual(["caveman", "tdd"]);
    expect(nameHeader).toHaveAttribute("aria-sort", "ascending");

    await userEvent.click(within(nameHeader).getByRole("button"));

    expect(dataRowNames()).toEqual(["tdd", "caveman"]);
    expect(nameHeader).toHaveAttribute("aria-sort", "descending");
  });

  it("sorts the narrowed subset, not the whole inventory", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const many: Primitive[] = [
      { type: "skill", name: "search-a", description: "A." },
      { type: "skill", name: "unrelated", description: "Z." },
      { type: "skill", name: "search-c", description: "C." },
      { type: "skill", name: "search-b", description: "B." },
    ];
    renderList(<InventoryList primitives={many} repos={[]} registryReady />);

    await userEvent.type(
      screen.getByRole("searchbox", { name: /search/i }),
      "search",
    );
    await userEvent.click(
      within(screen.getByRole("columnheader", { name: /name/i })).getByRole(
        "button",
      ),
    );

    expect(dataRowNames()).toEqual(["search-a", "search-b", "search-c"]);
  });
});
