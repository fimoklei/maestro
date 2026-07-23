import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { driftViewModel } from "../drift/drift-view-model";
import type { DeploymentTarget } from "./deployed-rollup";
import { InventoryList } from "./inventory-list";
import type { Primitive } from "./use-inventory";

function dataRowNames(): (string | null)[] {
  const [, ...bodyRows] = screen.getAllByRole("row");
  return bodyRows.map(
    (row) => within(row).getAllByRole("cell")[1]?.textContent ?? null,
  );
}

const ranDrift = (
  behind: { name: string; current: string; latest: string }[],
) => driftViewModel({ data: { behind }, isError: false });

const deployedTo = (
  names: string[],
  behind: { name: string; current: string; latest: string }[] = [],
): DeploymentTarget => ({
  label: "",
  deployed: { status: "ready", names, skippedCount: 0 },
  primitives: names.map((name) => ({
    type: "skill" as const,
    name,
    version: "v1.0.0",
  })),
  drift: ranDrift(behind),
});

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

  it("shows a Deployed column with a per-skill target roll-up", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    // tdd is deployed to two targets (one behind); caveman reaches none.
    const targets = [
      deployedTo(["tdd"], []),
      deployedTo(
        ["tdd"],
        [{ name: "tdd", current: "v1.0.0", latest: "v1.1.0" }],
      ),
    ];
    renderList(
      <InventoryList
        primitives={primitives}
        repos={[]}
        registryReady
        targets={targets}
      />,
    );

    expect(
      screen.getByRole("columnheader", { name: "Deployed" }),
    ).toBeInTheDocument();
    expect(screen.getByText("→ 2 targets")).toBeInTheDocument();
    expect(screen.getByText("▲1")).toBeInTheDocument();
    expect(screen.getByText("not deployed")).toBeInTheDocument();
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

  it("opens a detail pane naming the skill when its row is selected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderList(
      <InventoryList
        primitives={primitives}
        repos={[]}
        registryReady
        targets={[deployedTo(["tdd"])]}
      />,
    );

    // No pane until a row is picked — the table is a pure scan surface (ADR-0016).
    expect(
      screen.queryByRole("complementary", { name: /tdd detail/i }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "tdd" }));

    const pane = screen.getByRole("complementary", { name: /tdd detail/i });
    expect(
      within(pane).getByRole("heading", { name: /tdd/i }),
    ).toBeInTheDocument();
    // The per-target version lens: tdd is deployed to the one target.
    expect(within(pane).getByText("v1.0.0")).toBeInTheDocument();
  });

  it("opens the pane when a non-name cell of the row is clicked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderList(
      <InventoryList
        primitives={primitives}
        repos={[]}
        registryReady
        targets={[deployedTo(["tdd"])]}
      />,
    );

    // Acceptance: clicking the ROW opens the pane, not only the name button.
    await userEvent.click(
      screen.getByRole("cell", { name: "Test-driven development." }),
    );

    expect(
      screen.getByRole("complementary", { name: /tdd detail/i }),
    ).toBeInTheDocument();
  });

  it("clears a stale reinstall action when the selected skill changes", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("/api/deploy-state/global")) {
          return new Response(
            JSON.stringify({
              tools: [{ tool: "claude-code", primitives: [] }],
              primitives: [],
              skipped: [],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url.startsWith("/api/drift")) {
          return new Response(JSON.stringify({ behind: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        // The deploy refuses with a forceable, not-proven-clean refusal.
        return new Response(
          JSON.stringify({
            message: "deployed copy diverged from its lock",
            error: "deployed-diverged-from-lock",
          }),
          { status: 409, headers: { "content-type": "application/json" } },
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    renderList(
      <InventoryList primitives={primitives} repos={[]} registryReady />,
    );

    // Open tdd, deploy, and drive it into the forceable-reinstall state.
    await userEvent.click(screen.getByRole("button", { name: "tdd" }));
    const tddPane = screen.getByRole("complementary", { name: /tdd detail/i });
    await userEvent.click(
      within(tddPane).getByRole("button", { name: /deploy/i }),
    );
    await screen.findByRole("button", { name: /reinstall fresh/i });

    // Switch to another skill: the reinstall action must not carry over, or a
    // click would force-overwrite the new skill without its own refusal (#66).
    await userEvent.click(screen.getByRole("button", { name: "caveman" }));

    expect(
      screen.queryByRole("button", { name: /reinstall fresh/i }),
    ).not.toBeInTheDocument();
  });

  it("removes the inline per-row deploy control, leaving deploy to the pane", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderList(
      <InventoryList
        primitives={primitives}
        repos={[]}
        registryReady
        targets={[deployedTo(["tdd"])]}
      />,
    );

    // The Actions column and its inline deploy control are gone; nothing deploys
    // from a row before the pane is opened.
    expect(
      screen.queryByRole("columnheader", { name: "Actions" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /deploy/i }),
    ).not.toBeInTheDocument();
  });

  it("closes the pane when its close control is activated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderList(
      <InventoryList primitives={primitives} repos={[]} registryReady />,
    );

    await userEvent.click(screen.getByRole("button", { name: "tdd" }));
    expect(
      screen.getByRole("complementary", { name: /tdd detail/i }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /close/i }));

    expect(
      screen.queryByRole("complementary", { name: /tdd detail/i }),
    ).not.toBeInTheDocument();
  });

  it("deploys the skill from the pane", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("/api/deploy-state/global")) {
          return new Response(
            JSON.stringify({
              tools: [{ tool: "claude-code", primitives: [] }],
              primitives: [],
              skipped: [],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url.startsWith("/api/drift")) {
          return new Response(JSON.stringify({ behind: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        // The deploy itself.
        return new Response(
          JSON.stringify({
            deployed: { type: "skill", name: "tdd", version: "v1.0.0" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    renderList(
      <InventoryList primitives={primitives} repos={[]} registryReady />,
    );

    await userEvent.click(screen.getByRole("button", { name: "tdd" }));
    const pane = screen.getByRole("complementary", { name: /tdd detail/i });
    await userEvent.click(
      within(pane).getByRole("button", { name: /deploy/i }),
    );

    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input) === "/api/deploy" &&
          init?.method === "POST" &&
          String(init.body).includes("tdd"),
      ),
    ).toBe(true);
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
