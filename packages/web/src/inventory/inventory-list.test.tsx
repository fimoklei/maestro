import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { driftViewModel } from "../drift/drift-view-model";
import { renderWithQuery } from "../test-utils";
import type { DeploymentTarget } from "./deployed-rollup";
import { InventoryList } from "./inventory-list";
import type { Primitive } from "./use-inventory";

function dataRowNames(): (string | null)[] {
  const [, ...bodyRows] = screen.getAllByRole("row");
  // Column order: bulk checkbox, Type, Name, Description, Deployed.
  return bodyRows.map(
    (row) => within(row).getAllByRole("cell")[2]?.textContent ?? null,
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
  target: { kind: "global" },
  deployed: { status: "ready", names, skippedCount: 0, attentionCount: 0 },
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
  return renderWithQuery(ui);
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
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skills" })).toBeInTheDocument();
    // Skills-only data yields exactly all + skills, never a hardcoded five.
    expect(
      screen.queryByRole("button", { name: "Hooks" }),
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

    await userEvent.click(screen.getByRole("button", { name: "Skills" }));

    expect(screen.getByRole("button", { name: "Skills" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("cell", { name: "tdd" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "caveman" })).toBeInTheDocument();
  });

  it("shows the explicit empty state instead of a blank table", () => {
    renderList(<InventoryList primitives={[]} repos={[]} registryReady />);

    expect(
      screen.getByText(/No skills in the Inventory\./i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
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
    expect(screen.getByText("Not deployed")).toBeInTheDocument();
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
      screen.queryByText(/no repositories registered\./i),
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

  it("closes the pane on Escape and returns focus to the row that opened it", async () => {
    // The pane persists across a row switch — inventory-list keeps one
    // instance and only swaps its `primitive` prop — so the return target
    // has to be wired per row, not read off whatever last held focus.
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

    const nameButton = screen.getByRole("button", { name: "tdd" });
    await userEvent.click(nameButton);
    expect(
      screen.getByRole("complementary", { name: /tdd detail/i }),
    ).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    expect(
      screen.queryByRole("complementary", { name: /tdd detail/i }),
    ).not.toBeInTheDocument();
    expect(document.activeElement).toBe(nameButton);
  });

  it("returns focus to the row button even after it was filtered away and remounted", async () => {
    // The row button is looked up fresh at close time, not captured once at
    // open — filtering can remount it as a different DOM node by then.
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

    const originalButton = screen.getByRole("button", { name: "tdd" });
    await userEvent.click(originalButton);
    expect(
      screen.getByRole("complementary", { name: /tdd detail/i }),
    ).toBeInTheDocument();

    const search = screen.getByLabelText(/search the inventory/i);
    await userEvent.type(search, "caveman");
    expect(
      screen.queryByRole("button", { name: "tdd" }),
    ).not.toBeInTheDocument();
    // Selection persists across a narrowing search — the pane stays open on
    // a row that is currently hidden from the table.
    expect(
      screen.getByRole("complementary", { name: /tdd detail/i }),
    ).toBeInTheDocument();

    await userEvent.clear(search);
    const restoredButton = screen.getByRole("button", { name: "tdd" });
    expect(restoredButton).not.toBe(originalButton);

    await userEvent.keyboard("{Escape}");

    expect(
      screen.queryByRole("complementary", { name: /tdd detail/i }),
    ).not.toBeInTheDocument();
    expect(document.activeElement).toBe(restoredButton);
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
    await screen.findByRole("button", { name: "Deploy again" });

    // Switch to another skill: the reinstall action must not carry over, or a
    // click would force-overwrite the new skill without its own refusal (#66).
    await userEvent.click(screen.getByRole("button", { name: "caveman" }));

    expect(
      screen.queryByRole("button", { name: "Deploy again" }),
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

    // The Actions column and its inline deploy control are gone; no row deploys
    // on its own before the pane is opened. The view-level strip above the
    // table is not a row control (#473).
    expect(
      screen.queryByRole("columnheader", { name: "Actions" }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("table")).queryByRole("button", {
        name: /deploy/i,
      }),
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

  it("gives each row a checkbox that stages the skill for bulk", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderList(
      <InventoryList primitives={primitives} repos={[]} registryReady />,
    );

    const checkbox = screen.getByRole("checkbox", { name: /stage tdd/i });
    expect(checkbox).not.toBeChecked();

    await userEvent.click(checkbox);

    expect(screen.getByRole("checkbox", { name: /stage tdd/i })).toBeChecked();
  });

  it("stages a skill without opening its detail pane", async () => {
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

    await userEvent.click(screen.getByRole("checkbox", { name: /stage tdd/i }));

    // Model A: staging never toggles the inspection surface.
    expect(
      screen.queryByRole("complementary", { name: /tdd detail/i }),
    ).not.toBeInTheDocument();
  });

  it("opens a detail pane without staging the skill", async () => {
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

    await userEvent.click(screen.getByRole("button", { name: "tdd" }));

    // Model A: inspecting never toggles the staged state.
    expect(
      screen.getByRole("complementary", { name: /tdd detail/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /stage tdd/i }),
    ).not.toBeChecked();
  });

  it("keeps a skill staged when the search narrows and re-widens the table", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderList(
      <InventoryList primitives={primitives} repos={[]} registryReady />,
    );

    await userEvent.click(screen.getByRole("checkbox", { name: /stage tdd/i }));

    const search = screen.getByRole("searchbox", { name: /search/i });
    await userEvent.type(search, "cave");
    // tdd is filtered out of view here, but its staged state must survive.
    expect(
      screen.queryByRole("checkbox", { name: /stage tdd/i }),
    ).not.toBeInTheDocument();

    await userEvent.clear(search);

    expect(screen.getByRole("checkbox", { name: /stage tdd/i })).toBeChecked();
  });

  it("reports how many staged skills the current filter hides", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderList(
      <InventoryList primitives={primitives} repos={[]} registryReady />,
    );

    // Nothing staged, nothing to bulk-deploy: the strip stays out of the way.
    expect(
      screen.queryByRole("status", { name: /staged for bulk deploy/i }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: /stage tdd/i }));
    await userEvent.click(
      screen.getByRole("checkbox", { name: /stage caveman/i }),
    );
    await userEvent.type(
      screen.getByRole("searchbox", { name: /search/i }),
      "cave",
    );

    const bar = screen.getByRole("status", { name: /staged for bulk deploy/i });
    expect(bar).toHaveTextContent(/2 staged for bulk deploy/i);
    expect(bar).toHaveTextContent(/1 hidden by the filter/i);
  });

  it("leaves the empty-registry hint to the deploy controls that need it", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderList(
      <InventoryList primitives={primitives} repos={[]} registryReady />,
    );

    expect(screen.queryByText(/no repositories registered/i)).toBeNull();
  });

  it("retires the bulk strip once the last skill is unstaged", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderList(
      <InventoryList primitives={primitives} repos={[]} registryReady />,
    );

    await userEvent.click(screen.getByRole("checkbox", { name: /stage tdd/i }));
    expect(
      screen.getByRole("status", { name: /staged for bulk deploy/i }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: /stage tdd/i }));
    expect(
      screen.queryByRole("status", { name: /staged for bulk deploy/i }),
    ).not.toBeInTheDocument();
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

  it("sizes its columns from the container, not from the cell contents", () => {
    // table-layout: auto let a long description push Deployed ~5800px
    // off-screen. jsdom can't measure geometry, so this asserts table-fixed;
    // reachable columns are proven in the browser.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderList(
      <InventoryList primitives={primitives} repos={[]} registryReady />,
    );

    expect(screen.getByRole("table")).toHaveClass("table-fixed");
  });

  it("stages a skill from the padding around its checkbox", async () => {
    // The 16px checkbox is under the 24px click-target floor; the padded
    // label grows the hit area but must toggle staging and stop the row's
    // own select handler, same as the box.
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

    const hitArea = screen
      .getByRole("checkbox", { name: /stage tdd/i })
      .closest("label");
    if (hitArea === null) throw new Error("checkbox has no label hit area");

    await userEvent.click(hitArea);

    expect(screen.getByRole("checkbox", { name: /stage tdd/i })).toBeChecked();
    expect(
      screen.queryByRole("complementary", { name: /tdd detail/i }),
    ).not.toBeInTheDocument();
  });
});

describe("InventoryList — bulk remove entry point (#422)", () => {
  const onTarget = (
    target: DeploymentTarget["target"],
    names: string[],
  ): DeploymentTarget => ({ ...deployedTo(names), target });

  const openTdd = async () => {
    await userEvent.click(screen.getByRole("button", { name: "tdd" }));
  };

  const listWith = (targets: DeploymentTarget[]) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderList(
      <InventoryList
        primitives={primitives}
        repos={[]}
        registryReady
        targets={targets}
      />,
    );
  };

  it("offers a bulk remove once the skill is on two or more targets", async () => {
    listWith([
      onTarget({ kind: "global" }, ["tdd"]),
      onTarget({ kind: "repo", repoPath: "/dev/acme-web" }, ["tdd"]),
    ]);

    await openTdd();

    expect(
      screen.getByRole("button", { name: "Remove from all 2 targets" }),
    ).toBeInTheDocument();
  });

  it("offers none on a single target, where the target's own remove already is", async () => {
    listWith([onTarget({ kind: "global" }, ["tdd"])]);

    await openTdd();

    expect(
      screen.queryByRole("button", { name: /remove from all/i }),
    ).toBeNull();
  });

  it("keeps today's line, and no section, when the skill is deployed nowhere", async () => {
    listWith([onTarget({ kind: "global" }, ["caveman"])]);

    await openTdd();

    expect(
      screen.getByText(/Not deployed to any target\./i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /remove from all/i }),
    ).toBeNull();
  });

  it("leaves a target whose deploy-state has not loaded out of the count (J04)", async () => {
    listWith([
      onTarget({ kind: "global" }, ["tdd"]),
      onTarget({ kind: "repo", repoPath: "/dev/acme-web" }, ["tdd"]),
      {
        label: "",
        target: { kind: "repo", repoPath: "/dev/unread" },
        deployed: { status: "pending" },
        primitives: [],
        drift: ranDrift([]),
      },
    ]);

    await openTdd();

    expect(
      screen.getByRole("button", { name: "Remove from all 2 targets" }),
    ).toBeInTheDocument();
  });
});
