import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { driftViewModel } from "../drift/drift-view-model";
import type { ReadDriftEntry } from "../drift/use-drift";
import { jsonResponse, renderWithQuery } from "../test-utils";
import type { DeploymentTarget } from "./deployed-rollup";
import { InventoryView } from "./inventory-view";
import type { Primitive } from "./use-inventory";

const grid = () => screen.getByRole("grid", { name: "Inventory table" });

// Column order: bulk checkbox, Type, Name, Description, Status, Targets, ⋮.
function cellsOf(name: string): string[] {
  const row = within(grid())
    .getAllByRole("row")
    .find((candidate) =>
      within(candidate)
        .queryAllByRole("gridcell")
        .some((cell) => cell.textContent === name),
    );
  if (row === undefined) throw new Error(`no row for ${name}`);
  return within(row)
    .getAllByRole("gridcell")
    .map((cell) => cell.textContent ?? "");
}

function dataRowNames(): string[] {
  const [, ...bodyRows] = within(grid()).getAllByRole("row");
  return bodyRows.map(
    (row) => within(row).getAllByRole("gridcell")[2]?.textContent ?? "",
  );
}

const ranDrift = (behind: ReadDriftEntry[]) =>
  driftViewModel({ data: { behind }, isError: false });

const deployedTo = (
  names: string[],
  behind: ReadDriftEntry[] = [],
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

const tddBehind: ReadDriftEntry = {
  name: "tdd",
  current: "v1.0.0",
  latest: "v1.1.0",
  reading: "behind",
};

const primitives: Primitive[] = [
  { type: "skill", name: "tdd", description: "Test-driven development." },
  { type: "skill", name: "caveman", description: "Terse mode." },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubPendingFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => {})),
  );
}

type Props = ComponentProps<typeof InventoryView>;

const baseProps: Props = {
  primitives,
  repos: [],
  registryReady: true,
  targets: [],
  notice: null,
  loading: false,
  reading: false,
  onReread: () => {},
};

function renderView(props: Partial<Props> = {}) {
  return renderWithQuery(<InventoryView {...baseProps} {...props} />);
}

async function openRow(name: string) {
  await userEvent.click(screen.getByRole("gridcell", { name }));
}

describe("InventoryView — the table", () => {
  it("renders skills in a grid with one meaning per column", () => {
    stubPendingFetch();
    renderView({ repos: [{ path: "/projects/alpha" }] });

    for (const header of ["Type", "Name", "Description", "Status", "Targets"]) {
      expect(
        within(grid()).getByRole("columnheader", { name: new RegExp(header) }),
      ).toBeInTheDocument();
    }
    expect(screen.getByRole("gridcell", { name: "tdd" })).toBeInTheDocument();
    expect(
      screen.getByRole("gridcell", { name: "Test-driven development." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("gridcell", { name: "caveman" }),
    ).toBeInTheDocument();
  });

  it("names each row's type in its plain word", () => {
    stubPendingFetch();
    renderView();

    expect(cellsOf("tdd")[1]).toBe("Skill");
    expect(within(grid()).getAllByText("Skill")).toHaveLength(2);
  });

  it("shows one status badge, the worst reading, and the reach as a number", () => {
    stubPendingFetch();
    // tdd is deployed to two targets (one behind); caveman reaches none.
    renderView({
      targets: [deployedTo(["tdd"]), deployedTo(["tdd"], [tddBehind])],
    });

    expect(cellsOf("tdd").slice(4, 6)).toEqual(["Behind", "2"]);
    expect(cellsOf("caveman").slice(4, 6)).toEqual(["Not deployed", "—"]);
  });

  it("reads Up to date for a skill whose every target is clean", () => {
    stubPendingFetch();
    renderView({ targets: [deployedTo(["tdd"])] });

    expect(cellsOf("tdd").slice(4, 6)).toEqual(["Up to date", "1"]);
  });

  it("shows no status while a target's deploy-state is still being read", () => {
    stubPendingFetch();
    renderView({
      targets: [
        deployedTo(["tdd"]),
        {
          label: "",
          target: { kind: "repo", repoPath: "/dev/unread" },
          deployed: { status: "pending" },
          primitives: [],
          drift: ranDrift([]),
        },
      ],
    });

    // Never a definite "Not deployed" before every read has answered.
    expect(screen.queryByText("Not deployed")).not.toBeInTheDocument();
    expect(cellsOf("tdd")[4]).toBe("");
  });

  it("keeps deploy out of the rows: a row's one control is its ⋮ menu", () => {
    stubPendingFetch();
    renderView({ targets: [deployedTo(["tdd"])] });

    expect(
      within(grid())
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(
      expect.arrayContaining(["Actions for tdd", "Actions for caveman"]),
    );
    expect(
      within(grid()).queryByRole("button", { name: /deploy/i }),
    ).not.toBeInTheDocument();
  });

  it("leaves the empty-registry hint to the deploy controls that need it", () => {
    stubPendingFetch();
    renderView();

    expect(screen.queryByText(/no repositories registered/i)).toBeNull();
  });

  it("hides the hint once a repo is registered", () => {
    stubPendingFetch();
    renderView({ repos: [{ path: "/projects/alpha" }] });

    expect(
      screen.queryByText(/no repositories registered\./i),
    ).not.toBeInTheDocument();
  });

  it("shows the explicit empty state instead of a blank table", async () => {
    const onOpenHarness = vi.fn();
    renderView({ primitives: [], onOpenHarness });

    expect(screen.getByText("No released skills")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Inventory shows skills from the latest release. Open Harness, then create a release to add skills.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Open Harness" }));
    expect(onOpenHarness).toHaveBeenCalledOnce();
  });
});

describe("InventoryView — band 2", () => {
  it("narrows the table to skills whose name matches the search text", async () => {
    stubPendingFetch();
    renderView();

    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search the Inventory" }),
      "cave",
    );

    expect(
      screen.getByRole("gridcell", { name: "caveman" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("gridcell", { name: "tdd" }),
    ).not.toBeInTheDocument();
  });

  it("tells the user when the search matches no skills", async () => {
    stubPendingFetch();
    renderView();

    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search the Inventory" }),
      "zzz",
    );

    expect(
      screen.getByText(
        "No skills match the search. Clear the search box to see every skill.",
      ),
    ).toBeInTheDocument();
  });

  it("offers a data-driven type filter of all plus the types present", async () => {
    stubPendingFetch();
    renderView();

    await userEvent.click(screen.getByRole("button", { name: "Filter" }));

    expect(
      await screen.findByRole("menuitemradio", { name: "All" }),
    ).toBeChecked();
    expect(
      screen.getByRole("menuitemradio", { name: "Skills" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitemradio", { name: "Hooks" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the skills visible and counts the type filter as active once chosen", async () => {
    stubPendingFetch();
    renderView();

    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    await userEvent.click(
      await screen.findByRole("menuitemradio", { name: "Skills" }),
    );

    expect(
      screen.getByRole("button", { name: "Filter, 1 active" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("gridcell", { name: "tdd" })).toBeInTheDocument();
    expect(
      screen.getByRole("gridcell", { name: "caveman" }),
    ).toBeInTheDocument();
  });

  it("filters by status and counts each status chosen", async () => {
    stubPendingFetch();
    renderView({ targets: [deployedTo(["tdd"], [tddBehind])] });

    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    await userEvent.click(
      await screen.findByRole("menuitemcheckbox", { name: "Behind" }),
    );
    await userEvent.keyboard("{Escape}");

    expect(
      screen.getByRole("button", { name: "Filter, 1 active" }),
    ).toBeInTheDocument();
    expect(dataRowNames()).toEqual(["tdd"]);
  });

  it("says why no row shows when the filters hide every skill", async () => {
    stubPendingFetch();
    renderView({ targets: [deployedTo(["tdd"])] });

    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    await userEvent.click(
      await screen.findByRole("menuitemcheckbox", { name: "Behind" }),
    );
    await userEvent.keyboard("{Escape}");

    expect(
      screen.getByText(
        "No skills match the filters. Select Filter to show more skills.",
      ),
    ).toBeInTheDocument();
  });

  it("switches a column off and on from Display", async () => {
    stubPendingFetch();
    renderView();
    const toggleDescription = async () => {
      await userEvent.click(screen.getByRole("button", { name: "Display" }));
      await userEvent.click(
        await screen.findByRole("menuitemcheckbox", { name: "Description" }),
      );
      await userEvent.keyboard("{Escape}");
    };

    await toggleDescription();
    expect(
      within(grid()).queryByRole("columnheader", { name: "Description" }),
    ).not.toBeInTheDocument();

    await toggleDescription();
    expect(
      within(grid()).getByRole("columnheader", { name: "Description" }),
    ).toBeInTheDocument();
  });

  it("groups the rows by status from Display, worst group first", async () => {
    stubPendingFetch();
    renderView({ targets: [deployedTo(["tdd"], [tddBehind])] });

    await userEvent.click(screen.getByRole("button", { name: "Display" }));
    await userEvent.click(
      await screen.findByRole("menuitemradio", { name: "Status" }),
    );
    await userEvent.keyboard("{Escape}");

    const rows = within(grid()).getAllByRole("row").slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      "Behind 1",
      expect.stringContaining("tdd"),
      "Not deployed 1",
      expect.stringContaining("caveman"),
    ]);
  });

  it("groups the rows by type from Display", async () => {
    stubPendingFetch();
    renderView();

    await userEvent.click(screen.getByRole("button", { name: "Display" }));
    await userEvent.click(
      await screen.findByRole("menuitemradio", { name: "Type" }),
    );
    await userEvent.keyboard("{Escape}");

    expect(within(grid()).getAllByRole("row")[1]).toHaveTextContent("Skills 2");
  });

  it("keeps Filter and Display focusable but unavailable while no skill is read", () => {
    renderView({ primitives: undefined });

    expect(
      screen.getByRole("button", { name: "Filter — no skills yet" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByRole("button", { name: "Display — no skills yet" }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("re-reads the Inventory from its icon-only control", async () => {
    const onReread = vi.fn();
    stubPendingFetch();
    renderView({ onReread });

    await userEvent.click(
      screen.getByRole("button", { name: "Re-read Inventory" }),
    );

    expect(onReread).toHaveBeenCalledOnce();
  });
});

describe("InventoryView — sorting", () => {
  it("sorts by name and shows the active sort when the header is clicked", async () => {
    stubPendingFetch();
    renderView();

    // Loaded order until the user asks for a sort.
    expect(dataRowNames()).toEqual(["tdd", "caveman"]);

    const nameHeader = within(grid()).getByRole("columnheader", {
      name: /name/i,
    });
    await userEvent.click(within(nameHeader).getByRole("button"));

    expect(dataRowNames()).toEqual(["caveman", "tdd"]);
    expect(nameHeader).toHaveAttribute("aria-sort", "ascending");

    await userEvent.click(within(nameHeader).getByRole("button"));

    expect(dataRowNames()).toEqual(["tdd", "caveman"]);
    expect(nameHeader).toHaveAttribute("aria-sort", "descending");
  });

  it("sorts the narrowed subset, not the whole inventory", async () => {
    stubPendingFetch();
    const many: Primitive[] = [
      { type: "skill", name: "search-a", description: "A." },
      { type: "skill", name: "unrelated", description: "Z." },
      { type: "skill", name: "search-c", description: "C." },
      { type: "skill", name: "search-b", description: "B." },
    ];
    renderView({ primitives: many });

    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search the Inventory" }),
      "search",
    );
    await userEvent.click(
      within(
        within(grid()).getByRole("columnheader", { name: /name/i }),
      ).getByRole("button"),
    );

    expect(dataRowNames()).toEqual(["search-a", "search-b", "search-c"]);
  });

  it("sorts by status, worst reading first", async () => {
    stubPendingFetch();
    renderView({ targets: [deployedTo(["caveman"], [])] });

    await userEvent.click(
      within(
        within(grid()).getByRole("columnheader", { name: /status/i }),
      ).getByRole("button"),
    );

    // Not deployed (tdd) is the resting reading, so it follows Up to date.
    expect(dataRowNames()).toEqual(["caveman", "tdd"]);
  });
});

describe("InventoryView — detail pane", () => {
  it("opens a detail pane naming the skill when its row is chosen", async () => {
    stubPendingFetch();
    renderView({ targets: [deployedTo(["tdd"])] });

    expect(
      screen.queryByRole("complementary", { name: /tdd detail/i }),
    ).not.toBeInTheDocument();

    await openRow("tdd");

    const pane = screen.getByRole("complementary", { name: /tdd detail/i });
    expect(
      within(pane).getByRole("heading", { name: /tdd/i }),
    ).toBeInTheDocument();
    // The per-target release lens: tdd is deployed to the one target (#956).
    expect(within(pane).getByText("v1.0.0")).toBeInTheDocument();
  });

  it("opens the pane when a non-name cell of the row is clicked", async () => {
    stubPendingFetch();
    renderView({ targets: [deployedTo(["tdd"])] });

    await openRow("Test-driven development.");

    expect(
      screen.getByRole("complementary", { name: /tdd detail/i }),
    ).toBeInTheDocument();
  });

  it("opens the active row's pane with Enter", async () => {
    stubPendingFetch();
    renderView();

    act(() => grid().focus());
    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(
      screen.getByRole("complementary", { name: /caveman detail/i }),
    ).toBeInTheDocument();
  });

  it("closes the pane on Escape and returns focus to the table", async () => {
    stubPendingFetch();
    renderView({ targets: [deployedTo(["tdd"])] });

    await openRow("tdd");
    expect(
      screen.getByRole("complementary", { name: /tdd detail/i }),
    ).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    expect(
      screen.queryByRole("complementary", { name: /tdd detail/i }),
    ).not.toBeInTheDocument();
    expect(grid()).toHaveFocus();
  });

  it("keeps the pane open on a row a narrowing search hides", async () => {
    stubPendingFetch();
    renderView({ targets: [deployedTo(["tdd"])] });

    await openRow("tdd");
    const search = screen.getByRole("searchbox", {
      name: "Search the Inventory",
    });
    await userEvent.type(search, "caveman");

    expect(
      screen.queryByRole("gridcell", { name: "tdd" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: /tdd detail/i }),
    ).toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.keyboard("{Escape}");
    expect(grid()).toHaveFocus();
  });

  it("closes the pane when its close control is activated", async () => {
    stubPendingFetch();
    renderView();

    await openRow("tdd");
    await userEvent.click(
      screen.getByRole("button", { name: "Close tdd detail" }),
    );

    expect(
      screen.queryByRole("complementary", { name: /tdd detail/i }),
    ).not.toBeInTheDocument();
  });

  // The dialog is mounted only while open, so the next skill's starts clean (#66).
  it("clears a stale reinstall action when the selected skill changes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/deploy-state/global")) {
          return jsonResponse({
            tools: [{ tool: "claude-code", primitives: [] }],
            primitives: [],
            skipped: [],
          });
        }
        if (url === "/api/deploy/bulk") {
          // A forceable, not-proven-clean refusal for the skill sent.
          return jsonResponse({
            target: { kind: "global" },
            deployed: [],
            attention: [
              {
                name: "tdd",
                error: "deployed-diverged-from-lock",
                forceable: true,
                copyReceipt: "c".repeat(64),
              },
            ],
            failed: [],
          });
        }
        return jsonResponse({ behind: [] });
      }),
    );
    renderView();

    await openRow("tdd");
    await userEvent.click(
      within(
        screen.getByRole("complementary", { name: "tdd detail" }),
      ).getByRole("button", { name: "Deploy skill" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Deploy 1 skill",
    });
    const run = within(dialog).getByRole("button", { name: /^Deploy skill/ });
    await waitFor(() => expect(run).toBeEnabled());
    await userEvent.click(run);
    await within(dialog).findByRole("button", { name: "Deploy tdd again" });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Close" }),
    );

    // Another skill: the reinstall action must not carry over, or a click
    // would force-overwrite the new skill without its own refusal.
    await openRow("caveman");
    await userEvent.click(
      within(
        screen.getByRole("complementary", { name: "caveman detail" }),
      ).getByRole("button", { name: "Deploy skill" }),
    );
    await screen.findByRole("dialog", { name: "Deploy 1 skill" });

    expect(screen.queryByRole("button", { name: /again/ })).toBeNull();
  });

  it("deploys the skill from the pane, through the deploy dialog", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("/api/deploy-state/global")) {
          return jsonResponse({
            tools: [{ tool: "claude-code", primitives: [] }],
            primitives: [],
            skipped: [],
          });
        }
        if (url === "/api/deploy/bulk") {
          return jsonResponse({
            target: { kind: "global" },
            deployed: [{ name: "tdd", version: "v1.0.0" }],
            attention: [],
            failed: [],
          });
        }
        return jsonResponse({ behind: [] });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    renderView();

    await openRow("tdd");
    await userEvent.click(
      within(
        screen.getByRole("complementary", { name: "tdd detail" }),
      ).getByRole("button", { name: "Deploy skill" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Deploy 1 skill",
    });
    const run = within(dialog).getByRole("button", { name: /^Deploy skill/ });
    await waitFor(() => expect(run).toBeEnabled());
    await userEvent.click(run);

    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input) === "/api/deploy/bulk" &&
          init?.method === "POST" &&
          JSON.parse(String(init.body)).names.join() === "tdd",
      ),
    ).toBe(true);
    expect(
      await within(dialog).findAllByText("Deployed to Global · 1 deployed"),
    ).not.toHaveLength(0);
  });
});

describe("InventoryView — bulk staging", () => {
  const checkbox = (name: string) =>
    screen.getByRole("checkbox", { name: `Select ${name} for bulk deploy` });

  it("gives each row a checkbox that stages the skill for bulk", async () => {
    stubPendingFetch();
    renderView();

    expect(checkbox("tdd")).not.toBeChecked();
    await userEvent.click(checkbox("tdd"));
    expect(checkbox("tdd")).toBeChecked();
  });

  it("stages the active row with Space", async () => {
    stubPendingFetch();
    renderView();

    act(() => grid().focus());
    await userEvent.keyboard(" ");

    expect(checkbox("tdd")).toBeChecked();
  });

  it("stages a skill without opening its detail pane", async () => {
    stubPendingFetch();
    renderView({ targets: [deployedTo(["tdd"])] });

    await userEvent.click(checkbox("tdd"));

    // Model A: staging never toggles the inspection surface.
    expect(
      screen.queryByRole("complementary", { name: /tdd detail/i }),
    ).not.toBeInTheDocument();
  });

  it("stages a skill from the padding around its checkbox", async () => {
    // The 16px box is under the 24px pointer floor; the padded label grows the
    // hit area, toggles staging and never opens the pane.
    stubPendingFetch();
    renderView({ targets: [deployedTo(["tdd"])] });

    const hitArea = checkbox("tdd").closest("label");
    if (hitArea === null) throw new Error("checkbox has no label hit area");
    await userEvent.click(hitArea);

    expect(checkbox("tdd")).toBeChecked();
    expect(
      screen.queryByRole("complementary", { name: /tdd detail/i }),
    ).not.toBeInTheDocument();
  });

  it("opens a detail pane without staging the skill", async () => {
    stubPendingFetch();
    renderView({ targets: [deployedTo(["tdd"])] });

    await openRow("tdd");

    // Model A: inspecting never toggles the staged state.
    expect(
      screen.getByRole("complementary", { name: /tdd detail/i }),
    ).toBeInTheDocument();
    expect(checkbox("tdd")).not.toBeChecked();
  });

  it("keeps a skill staged when the search narrows and re-widens the table", async () => {
    stubPendingFetch();
    renderView();

    await userEvent.click(checkbox("tdd"));
    const search = screen.getByRole("searchbox", {
      name: "Search the Inventory",
    });
    await userEvent.type(search, "cave");
    expect(
      screen.queryByRole("checkbox", { name: /select tdd/i }),
    ).not.toBeInTheDocument();

    await userEvent.clear(search);

    expect(checkbox("tdd")).toBeChecked();
  });

  const selectionBar = () => screen.queryByRole("group", { name: /selected/ });

  it("raises the selection bar with the count and the actions on the selection", async () => {
    stubPendingFetch();
    renderView();

    expect(selectionBar()).not.toBeInTheDocument();

    await userEvent.click(checkbox("tdd"));
    await userEvent.click(checkbox("caveman"));
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search the Inventory" }),
      "cave",
    );

    const bar = screen.getByRole("group", { name: "2 selected" });
    expect(bar).toHaveTextContent(/1 hidden by the filter/i);
    expect(
      within(bar).getByRole("button", { name: "Deploy skills" }),
    ).toBeInTheDocument();
  });

  it("retires the selection bar once the last skill is unselected", async () => {
    stubPendingFetch();
    renderView();

    await userEvent.click(checkbox("tdd"));
    expect(selectionBar()).toBeInTheDocument();

    await userEvent.click(checkbox("tdd"));
    expect(selectionBar()).not.toBeInTheDocument();
  });

  it("clears the whole selection from the bar", async () => {
    stubPendingFetch();
    renderView();

    await userEvent.click(checkbox("tdd"));
    await userEvent.click(checkbox("caveman"));
    await userEvent.click(
      screen.getByRole("button", { name: "Clear selection" }),
    );

    expect(selectionBar()).not.toBeInTheDocument();
    expect(checkbox("tdd")).not.toBeChecked();
    expect(checkbox("caveman")).not.toBeChecked();
  });

  it("selects every shown skill from the column header", async () => {
    stubPendingFetch();
    renderView();

    await userEvent.click(
      screen.getByRole("checkbox", { name: "Select all for bulk deploy" }),
    );

    expect(checkbox("tdd")).toBeChecked();
    expect(checkbox("caveman")).toBeChecked();
    expect(
      screen.getByRole("group", { name: "2 selected" }),
    ).toBeInTheDocument();
  });
});

describe("InventoryView — bulk remove entry point (#422)", () => {
  const onTarget = (
    target: DeploymentTarget["target"],
    names: string[],
  ): DeploymentTarget => ({ ...deployedTo(names), target });

  const viewWith = (targets: DeploymentTarget[]) => {
    stubPendingFetch();
    renderView({ targets });
  };

  it("offers a bulk remove once the skill is on two or more targets", async () => {
    viewWith([
      onTarget({ kind: "global" }, ["tdd"]),
      onTarget({ kind: "repo", repoPath: "/dev/acme-web" }, ["tdd"]),
    ]);

    await openRow("tdd");

    expect(
      screen.getByRole("button", { name: "Remove from all 2 targets" }),
    ).toBeInTheDocument();
  });

  it("offers none on a single target, where the target's own remove already is", async () => {
    viewWith([onTarget({ kind: "global" }, ["tdd"])]);

    await openRow("tdd");

    expect(
      screen.queryByRole("button", { name: /remove from all/i }),
    ).toBeNull();
  });

  it("keeps today's line, and no section, when the skill is deployed nowhere", async () => {
    viewWith([onTarget({ kind: "global" }, ["caveman"])]);

    await openRow("tdd");

    expect(
      screen.getByText(/Not deployed to any target\./i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /remove from all/i }),
    ).toBeNull();
  });

  // #1066: a global deploy is one target per detected tool, so the pane lists
  // each tool and the foot counts the same targets.
  it("counts the targets the pane lists, each global tool among them", async () => {
    viewWith([
      {
        ...onTarget({ kind: "global" }, ["tdd"]),
        label: "Claude Code",
        tool: "claude",
      },
      {
        ...onTarget({ kind: "global" }, ["tdd"]),
        label: "Codex",
        tool: "codex",
      },
      onTarget({ kind: "repo", repoPath: "/dev/acme-web" }, ["tdd"]),
    ]);

    await openRow("tdd");

    const pane = screen.getByRole("complementary", { name: "tdd detail" });
    expect(
      within(pane)
        .getAllByRole("listitem")
        .map((row) => row.textContent?.replace(/v1\.0\.0.*$/, "")),
    ).toHaveLength(3);
    expect(
      within(pane).getByRole("button", { name: "Remove from all 3 targets" }),
    ).toBeInTheDocument();
  });

  it("offers none where every listed target is one global removal", async () => {
    viewWith([
      {
        ...onTarget({ kind: "global" }, ["tdd"]),
        label: "Claude Code",
        tool: "claude",
      },
      {
        ...onTarget({ kind: "global" }, ["tdd"]),
        label: "Codex",
        tool: "codex",
      },
    ]);

    await openRow("tdd");

    // Each tool row's own Remove from target already removes from both.
    expect(
      screen.queryByRole("button", { name: /remove from all/i }),
    ).toBeNull();
  });

  it("leaves a target whose deploy-state has not loaded out of the count (J04)", async () => {
    viewWith([
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

    await openRow("tdd");

    expect(
      screen.getByRole("button", { name: "Remove from all 2 targets" }),
    ).toBeInTheDocument();
  });
});

describe("InventoryView — reading", () => {
  const region = () => screen.getByTestId("inventory-status-region");

  it("draws skeleton rows while a slow read runs and marks the table busy", () => {
    renderView({ primitives: undefined, loading: true, reading: true });

    expect(grid()).toHaveAttribute("aria-busy", "true");
    expect(within(grid()).getAllByRole("row").length).toBeGreaterThan(1);
  });

  it("announces a read when its skeleton appears, then the Inventory loaded", () => {
    const view = renderView({ primitives: undefined });
    expect(region()).toHaveAttribute("role", "status");
    expect(region()).toBeEmptyDOMElement();

    view.rerender(
      <InventoryView {...baseProps} primitives={undefined} loading reading />,
    );
    expect(region()).toHaveTextContent("Loading the Inventory…");

    view.rerender(<InventoryView {...baseProps} />);
    expect(region()).toHaveTextContent("Inventory loaded.");
  });

  it("keeps the previous rows under a failed re-read, with the notice above them", async () => {
    const onReread = vi.fn();
    stubPendingFetch();
    renderView({
      onReread,
      notice: {
        level: "error",
        label: "Could not read Inventory",
        message: "Select Re-read Inventory to try again.",
        action: { label: "Re-read Inventory", onClick: onReread },
      },
    });

    expect(screen.getByText("Could not read Inventory")).toBeInTheDocument();
    expect(screen.getByRole("gridcell", { name: "tdd" })).toBeInTheDocument();
  });
});

// A registered repo following one release; `changed` names the skills that
// release changed, which read Behind on it.
const onRepo = (
  repoPath: string,
  names: string[],
  changed: string[] = [],
): DeploymentTarget => ({
  label: repoPath.split("/").at(-1) ?? repoPath,
  target: { kind: "repo", repoPath },
  deployed: { status: "ready", names, skippedCount: 0, attentionCount: 0 },
  primitives: names.map((name) => ({
    type: "skill" as const,
    name,
    version: "v0.3.2",
  })),
  drift: ranDrift([]),
  releaseHead: {
    release: "v0.3.2",
    latestRelease: "v0.3.4",
    changed: changed.length,
    changedSkills: changed,
    selection: names,
    selected: names.length,
    comparedAt: "2026-09-12T10:00:00.000Z",
  },
});

const repos = [{ path: "/projects/alpha" }, { path: "/projects/beta" }];

async function openMenu(name: string) {
  await userEvent.click(
    within(grid()).getByRole("button", { name: `Actions for ${name}` }),
  );
  return screen.findByRole("menu");
}

const menuItems = (menu: HTMLElement) =>
  within(menu)
    .getAllByRole("menuitem")
    .map((item) => item.textContent);

describe("InventoryView — row menu", () => {
  // #1065: the row's ⋮ and the pane's foot hold the same items.
  it("offers Deploy skill, and leaves Update target to the Behind target's row", async () => {
    stubPendingFetch();
    renderView({
      repos,
      targets: [onRepo("/projects/beta", ["tdd"], ["tdd"])],
    });

    expect(menuItems(await openMenu("tdd"))).toEqual(["Deploy skill"]);
  });

  it("offers the removal where the skill reaches two targets, as the pane does", async () => {
    stubPendingFetch();
    renderView({
      repos,
      targets: [
        onRepo("/projects/alpha", ["tdd"]),
        onRepo("/projects/beta", ["tdd"]),
      ],
    });

    expect(menuItems(await openMenu("tdd"))).toEqual([
      "Deploy skill",
      "Remove from all 2 targets",
    ]);
    await userEvent.keyboard("{Escape}");
    await openRow("tdd");
    const pane = screen.getByRole("complementary", { name: "tdd detail" });
    expect(
      within(pane)
        .getAllByRole("button")
        .map((button) => button.textContent)
        .filter(
          (label) => label === "Deploy skill" || /^Remove/.test(label ?? ""),
        ),
    ).toEqual(["Deploy skill", "Remove from all 2 targets"]);
  });

  it("opens the deploy dialog for this skill alone on Deploy skill", async () => {
    stubPendingFetch();
    renderView({ repos });

    await openMenu("tdd");
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Deploy skill" }),
    );

    expect(
      await screen.findByRole("dialog", { name: "Deploy 1 skill" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "tdd detail", hidden: true }),
    ).toBeInTheDocument();
  });

  it("opens the same dialog from the pane's foot", async () => {
    stubPendingFetch();
    renderView({ repos });

    await openRow("tdd");
    await userEvent.click(
      within(
        screen.getByRole("complementary", { name: "tdd detail" }),
      ).getByRole("button", { name: "Deploy skill" }),
    );

    expect(
      await screen.findByRole("dialog", { name: "Deploy 1 skill" }),
    ).toBeInTheDocument();
  });

  it("opens the removal for every target on its menu item", async () => {
    stubPendingFetch();
    renderView({
      repos,
      targets: [
        onRepo("/projects/alpha", ["tdd"]),
        onRepo("/projects/beta", ["tdd"]),
      ],
    });

    await openMenu("tdd");
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Remove from all 2 targets" }),
    );

    expect(
      await screen.findByRole("dialog", { name: "Remove tdd from 2 targets" }),
    ).toBeInTheDocument();
  });
});

describe("InventoryView — a target row in the pane", () => {
  const targetMenu = async (label: string) => {
    const pane = screen.getByRole("complementary", { name: "tdd detail" });
    await userEvent.click(
      within(pane).getByRole("button", { name: `Actions for ${label}` }),
    );
    return screen.findByRole("menu");
  };

  it("offers Update target only on a target where the skill is Behind", async () => {
    stubPendingFetch();
    renderView({
      repos,
      targets: [
        onRepo("/projects/alpha", ["tdd"]),
        onRepo("/projects/beta", ["tdd"], ["tdd"]),
      ],
    });
    await openRow("tdd");

    expect(menuItems(await targetMenu("beta"))).toEqual([
      "Update target",
      "Remove from target",
    ]);
    await userEvent.keyboard("{Escape}");
    expect(menuItems(await targetMenu("alpha"))).toEqual([
      "Remove from target",
    ]);
  });

  it("names Show in Deploy-state where the screen can open that row", async () => {
    stubPendingFetch();
    const onShowTarget = vi.fn();
    renderView({
      repos,
      targets: [onRepo("/projects/beta", ["tdd"])],
      onShowTarget,
    });
    await openRow("tdd");

    const menu = await targetMenu("beta");
    expect(menuItems(menu)).toEqual([
      "Show in Deploy-state",
      "Remove from target",
    ]);
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Show in Deploy-state" }),
    );
    expect(onShowTarget).toHaveBeenCalledWith("repo:/projects/beta");
  });

  // Priced with this skill, as the Inventory's entrance always was (#955).
  it("opens Update target for that target, priced with this skill", async () => {
    const previews: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/deploy/update/preflight") {
          previews.push(JSON.parse(String(init?.body)));
          return new Promise<Response>(() => {});
        }
        return jsonResponse({ tools: [], primitives: [], skipped: [] });
      }),
    );
    renderView({
      repos,
      targets: [onRepo("/projects/beta", ["tdd"], ["tdd"])],
    });
    await openRow("tdd");

    await targetMenu("beta");
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Update target" }),
    );

    expect(
      await screen.findByRole("dialog", { name: "Update beta" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(previews).toEqual([
        { target: { kind: "repo", repoPath: "/projects/beta" }, add: "tdd" },
      ]),
    );
  });

  // apm's uninstall has no -t: a global removal takes every detected tool, so a
  // tool row's label says so instead of naming its tool alone.
  it("names every global tool on a global row's removal", async () => {
    stubPendingFetch();
    renderView({
      targets: [
        {
          ...deployedTo(["tdd"]),
          target: { kind: "global" },
          label: "Claude Code",
          tool: "claude",
        },
        {
          ...deployedTo(["tdd"]),
          target: { kind: "global" },
          label: "Codex",
          tool: "codex",
        },
      ],
    });
    await openRow("tdd");

    expect(menuItems(await targetMenu("Claude Code"))).toEqual([
      "Remove from Claude Code and Codex",
    ]);
  });

  it("opens the removal from that one target, confirmed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "/api/deploy/remove/preflight") {
          return new Promise<Response>(() => {});
        }
        return jsonResponse({ tools: [], primitives: [], skipped: [] });
      }),
    );
    renderView({
      repos,
      targets: [
        onRepo("/projects/alpha", ["tdd"]),
        onRepo("/projects/beta", ["tdd"]),
      ],
    });
    await openRow("tdd");

    await targetMenu("beta");
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Remove from target" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("tdd");
    expect(dialog).toHaveTextContent("/projects/beta");
  });
});

describe("InventoryView — hover card", () => {
  it("summarises the status on hover, naming each target and its reading", async () => {
    stubPendingFetch();
    renderView({ targets: [onRepo("/projects/beta", ["tdd"], ["tdd"])] });

    await userEvent.hover(within(grid()).getByText("Behind"));

    const card = await screen.findByText("Deployed to 1 target");
    const row = within(card.parentElement as HTMLElement).getByRole("listitem");
    expect(row).toHaveTextContent("beta");
    expect(row).toHaveTextContent("v0.3.2");
    expect(row).toHaveTextContent("Behind");
  });

  it("expands the Targets number into its targets on hover", async () => {
    stubPendingFetch();
    renderView({
      targets: [
        onRepo("/projects/alpha", ["tdd"]),
        onRepo("/projects/beta", ["tdd"]),
      ],
    });

    await userEvent.hover(within(grid()).getByText("2"));

    expect(
      await screen.findByText("Deployed to 2 targets"),
    ).toBeInTheDocument();
  });

  it("opens for the row the keyboard is on", async () => {
    stubPendingFetch();
    renderView({ targets: [onRepo("/projects/beta", ["tdd"])] });

    act(() => grid().focus());

    expect(await screen.findByText("Deployed to 1 target")).toBeInTheDocument();
  });
});

describe("InventoryView — paging the pane", () => {
  it("states the open row's place and pages through the rows as shown", async () => {
    stubPendingFetch();
    renderView();

    // Sorted by name: caveman, then tdd.
    await userEvent.click(
      within(
        within(grid()).getByRole("columnheader", { name: /name/i }),
      ).getByRole("button"),
    );
    await openRow("caveman");
    const pane = screen.getByRole("complementary", { name: "caveman detail" });
    expect(pane).toHaveTextContent("1 / 2");

    await userEvent.keyboard("{ArrowDown}");

    const next = screen.getByRole("complementary", { name: "tdd detail" });
    expect(next).toHaveTextContent("2 / 2");
    expect(within(next).getByRole("heading", { name: "tdd" })).toHaveFocus();
  });

  it("keeps one foot while paging past a skill on two targets", async () => {
    stubPendingFetch();
    renderView({
      targets: [
        { ...deployedTo(["tdd"]), label: "Global" },
        {
          ...deployedTo(["tdd"]),
          label: "acme-web",
          target: { kind: "repo", repoPath: "/dev/acme-web" },
        },
      ],
    });

    await openRow("tdd");
    await userEvent.keyboard("{ArrowDown}{ArrowUp}{ArrowDown}");

    const pane = screen.getByRole("complementary", { name: "caveman detail" });
    expect(
      within(pane).getAllByRole("button", { name: "Deploy skill" }),
    ).toHaveLength(1);
  });

  it("returns focus to the table on the row it paged to", async () => {
    stubPendingFetch();
    renderView();

    await openRow("tdd");
    await userEvent.keyboard("{ArrowDown}{Escape}");

    expect(grid()).toHaveFocus();
    const id = grid().getAttribute("aria-activedescendant");
    expect(document.getElementById(id ?? "")).toHaveTextContent("caveman");
  });
});
