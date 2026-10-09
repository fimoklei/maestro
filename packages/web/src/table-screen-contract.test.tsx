import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { QueryClient } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  renderDeployState,
  stubServer,
} from "./deploy-state/deploy-state-test-helpers";
import { driftViewModel } from "./drift/drift-view-model";
import {
  RELEASED,
  renderHarness,
  row as stageRow,
  stubHarnessServer,
  withStages,
} from "./harness/harness-flow-fixture";
import { pullRequest } from "./harness/stage-row-fixture";
import { InventoryPanel } from "./inventory/inventory-panel";
import { InventoryView } from "./inventory/inventory-view";
import {
  type FakeRegistry,
  renderRepositories,
  stubRegistry,
} from "./registry/repositories-test-helpers";
import { jsonResponse, measureAs, renderWithQuery } from "./test-utils";

// Proves each table screen runs on `TableScreen`, not the module itself, and
// that its Status card, name cell and row actions follow design.md.

/** One row whose Status card and name the checks open. */
type StatusCard = {
  render: () => void;
  name: string;
  badge: string;
  body: string;
  /** Null where the screen knows no read age. */
  readAge: string | null;
};

/** One row whose Status is still being read. */
type StatusStillReading = { render: () => void; name: string };

type Row = {
  /** The screen's source, from `packages/web/src`. */
  file: string;
  name: string;
  render: () => void;
  /** Null for a screen without a hover card. */
  card: StatusCard | null;
  /** Null for a screen whose Status is never read apart from its rows. */
  reading: StatusStillReading | null;
  /** Header names in order: checkbox, name, Status, secondary, GitHub, ⋮. */
  columns: string[];
  actions: RowActions;
  leaves: RowLeaves;
};

/** Two rows, the first of which a later read no longer holds. */
type RowLeaves = {
  render: () => { queryClient: QueryClient };
  first: string;
  /** The row that takes the first one's place. */
  next: string;
  /** The server stops holding the first row. */
  drop: () => void;
};

const deployStateLeaves = (): RowLeaves => {
  let repos = ["/Users/me/a", "/Users/me/b"];
  return {
    render: () => {
      stubServer(() => ({ repos }));
      return renderDeployState();
    },
    first: "…/me/a",
    next: "…/me/b",
    drop: () => {
      repos = ["/Users/me/b"];
    },
  };
};

const harnessLeaves = (): RowLeaves => {
  const proposal = (skills: string[]) =>
    withStages(RELEASED, {
      proposal: skills.map((skill) =>
        stageRow("pending-proposal", skill, "not-yet-proposed"),
      ),
    });
  const read = { body: proposal(["alpha", "beta"]) };
  return {
    render: () => {
      stubHarnessServer({ read });
      return renderHarness();
    },
    first: "alpha",
    next: "beta",
    drop: () => {
      read.body = proposal(["beta"]);
    },
  };
};

const inventoryLeaves = (): RowLeaves => {
  let names = ["alpha", "beta"];
  return {
    render: () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) =>
          String(input).startsWith("/api/registry")
            ? jsonResponse({ repos: [] })
            : String(input) === "/api/inventory/primitives"
              ? jsonResponse({
                  primitives: names.map((name) => ({
                    type: "skill",
                    name,
                    description: "A skill.",
                  })),
                })
              : new Promise<Response>(() => {}),
        ),
      );
      return renderWithQuery(
        <MemoryRouter>
          <InventoryPanel />
        </MemoryRouter>,
      );
    },
    first: "alpha",
    next: "beta",
    drop: () => {
      names = ["beta"];
    },
  };
};

const repositoriesLeaves = (): RowLeaves => {
  const registry: FakeRegistry = {
    repos: [
      { path: "/home/me/acme-api", status: "ready" },
      { path: "/home/me/acme-web", status: "ready" },
    ],
  };
  return {
    render: () => {
      stubRegistry(registry);
      return renderRepositories();
    },
    first: "…/me/acme-api",
    next: "…/me/acme-web",
    drop: () => {
      registry.repos = registry.repos.slice(1);
    },
  };
};

/** One row whose ⋮ menu, and pane foot where the screen has a pane, the checks open. */
type RowActions = {
  render: () => void;
  name: string;
  /** Every destructive item the row offers, in ⋮ order. */
  destructive: string[];
  pane: boolean;
  /** Null where every ⋮ item opens a dialog or another screen. */
  write: DirectWrite | null;
  /** One ⋮ item: whether it opens a dialog, and whether it opens the pane. */
  item: { label: string; dialog: boolean; opensPane: boolean };
};

/** A ⋮ item that runs its write at once, with no dialog of its own. */
type DirectWrite = {
  render: () => void;
  name: string;
  item: string;
  /** The pane's foot offers it too. */
  foot: boolean;
};

// Every write the server is sent from here on stays running.
const holdWrites = () => {
  const answer = fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      (init?.method ?? "GET") === "GET"
        ? answer(input, init)
        : new Promise<Response>(() => {}),
    ),
  );
};

// A target behind its latest release: its Status card and its Update target.
const renderBehindTarget = () => {
  stubServer(() => ({
    repos: ["/Users/me/a"],
    repo: {
      "/Users/me/a": {
        primitives: [{ type: "skill", name: "tdd", version: "v0.3.2" }],
        skipped: [],
        releaseHead: {
          release: "v0.3.2",
          latestRelease: "v0.3.4",
          changed: 2,
          changedSkills: ["tdd"],
          selection: ["tdd"],
          selected: 5,
          comparedAt: new Date().toISOString(),
        },
      },
    },
  }));
  renderDeployState();
};

const renderInventoryRow = () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => {})),
  );
  renderWithQuery(
    <InventoryView
      primitives={[TDD]}
      repos={[]}
      registryReady
      targets={[
        {
          label: "",
          target: { kind: "global" },
          deployed: {
            status: "ready",
            names: ["tdd"],
            skippedCount: 0,
            attentionCount: 0,
          },
          primitives: [{ type: "skill", name: "tdd", version: "v1.0.0" }],
          drift: driftViewModel({ data: { behind: [] }, isError: false }),
        },
      ]}
      failure={null}
      reading={false}
      onReread={() => {}}
      clone={{ kind: "checking" }}
      onDeleted={() => {}}
    />,
  );
};

const TDD = { type: "skill" as const, name: "tdd", description: "Test first." };

const ON_TABLE_SCREEN: Row[] = [
  {
    file: "deploy-state/deploy-state-view.tsx",
    name: "Deploy-state",
    leaves: deployStateLeaves(),
    render: () => {
      stubServer(() => ({ repos: ["/Users/me/a"] }));
      renderDeployState();
    },
    card: {
      render: renderBehindTarget,
      name: "…/me/a",
      badge: "Behind",
      body: "2 of 5 deployed skills changed in v0.3.4.",
      readAge: "Read just now",
    },
    reading: {
      render: () => {
        stubServer(() => ({
          global: {
            tools: [
              {
                tool: "claude",
                primitives: [{ type: "skill", name: "tdd", version: "v1" }],
              },
            ],
            skipped: [],
          },
          drift: { global: new Promise(() => {}) },
        }));
        renderDeployState();
      },
      name: "Claude Code",
    },
    columns: ["Target", "Status", "Release", "Skills", "GitHub", "Actions"],
    // A target row removes nothing; its skills' removal sits in the pane's
    // sub-list. Every item that stays on the screen opens the pane.
    actions: {
      render: renderBehindTarget,
      name: "…/me/a",
      destructive: [],
      pane: true,
      // Its pane offers the retry in the notice, not the foot.
      write: {
        render: () => {
          stubServer(() => ({
            repos: ["/Users/me/a"],
            repo: {
              "/Users/me/a": {
                primitives: [{ type: "skill", name: "tdd", version: "v0.3.2" }],
                skipped: [],
                pendingOperation: {
                  kind: "deploy",
                  release: "v0.3.4",
                  desired: ["tdd"],
                },
              },
            },
          }));
          renderDeployState();
        },
        name: "…/me/a",
        item: "Retry deploy",
        foot: false,
      },
      item: { label: "Update target", dialog: true, opensPane: true },
    },
  },
  {
    file: "harness/harness-view.tsx",
    name: "Harness",
    leaves: harnessLeaves(),
    render: () => {
      stubHarnessServer({ read: { body: RELEASED } });
      renderHarness();
    },
    card: {
      render: () => {
        stubHarnessServer({
          read: {
            body: withStages(RELEASED, {
              proposal: [
                stageRow("pending-proposal", "tdd", "not-yet-proposed"),
              ],
            }),
          },
        });
        renderHarness();
      },
      name: "tdd",
      badge: "Not yet proposed",
      body: "Your local copy differs from main.",
      readAge: "Not read yet",
    },
    reading: null,
    columns: [
      "Name",
      "Status",
      "Type",
      "Change",
      "Pull request",
      "Also in",
      "Actions",
    ],
    // A proposed deletion in review: withdrawn or undone in the clone.
    actions: {
      render: () => {
        stubHarnessServer({
          read: {
            body: withStages(RELEASED, {
              review: [
                stageRow("pending-review", "old-skill", "waiting-for-review", {
                  change: "deletion",
                  requests: [pullRequest(45, "old-skill")],
                  restorable: true,
                }),
              ],
            }),
          },
        });
        renderHarness();
      },
      name: "old-skill",
      destructive: ["Withdraw proposal", "Restore skill"],
      pane: true,
      write: {
        render: () => {
          stubHarnessServer({
            read: {
              body: withStages(RELEASED, {
                proposal: [
                  stageRow("pending-proposal", "tdd", "not-yet-proposed"),
                ],
              }),
            },
          });
          renderHarness();
        },
        name: "tdd",
        item: "Propose change",
        foot: true,
      },
      item: { label: "Withdraw proposal", dialog: true, opensPane: false },
    },
  },
  {
    file: "inventory/inventory-view.tsx",
    name: "Inventory",
    leaves: inventoryLeaves(),
    render: () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) =>
          String(input).startsWith("/api/registry")
            ? jsonResponse({ repos: [] })
            : jsonResponse({ primitives: [] }),
        ),
      );
      renderWithQuery(
        <MemoryRouter>
          <InventoryPanel />
        </MemoryRouter>,
      );
    },
    card: {
      render: renderInventoryRow,
      name: "tdd",
      badge: "Up to date",
      body: "Deployed to 1 target",
      readAge: null,
    },
    reading: {
      render: () => {
        vi.stubGlobal(
          "fetch",
          vi.fn(() => new Promise<Response>(() => {})),
        );
        renderWithQuery(
          <InventoryView
            primitives={[TDD]}
            repos={[]}
            registryReady
            targets={[
              {
                label: "",
                target: { kind: "global" },
                deployed: { status: "pending" },
                primitives: [],
                drift: driftViewModel({ data: { behind: [] }, isError: false }),
              },
            ]}
            failure={null}
            reading={false}
            onReread={() => {}}
            clone={{ kind: "checking" }}
            onDeleted={() => {}}
          />,
        );
      },
      name: "tdd",
    },
    columns: [
      "Select for bulk deploy",
      "Name",
      "Status",
      "Type",
      "Description",
      "Targets",
      "Actions",
    ],
    actions: {
      render: renderInventoryRow,
      name: "tdd",
      destructive: ["Delete skill"],
      pane: true,
      write: null,
      item: { label: "Deploy skill", dialog: true, opensPane: true },
    },
  },
  {
    file: "registry/repositories-view.tsx",
    name: "Repositories",
    leaves: repositoriesLeaves(),
    render: () => {
      stubRegistry({ repos: [{ path: "/home/me/acme-web", status: "ready" }] });
      renderRepositories();
    },
    card: null,
    reading: null,
    columns: ["Repository", "Status", "Folder path", "GitHub", "Actions"],
    actions: {
      render: () => {
        stubRegistry({
          repos: [{ path: "/home/me/acme-web", status: "ready" }],
        });
        renderRepositories();
      },
      name: "…/me/acme-web",
      destructive: ["Unregister"],
      pane: false,
      write: null,
      item: { label: "Unregister", dialog: true, opensPane: false },
    },
  },
];

// The labels design.md confirms with a danger button.
const DESTRUCTIVE = /^(Remove|Delete|Unregister|Withdraw|Restore|Discard)\b/;

function expectDanger(controls: HTMLElement[], destructive: string[]) {
  const found = controls.filter((control) =>
    DESTRUCTIVE.test(control.textContent ?? ""),
  );
  expect(found.map((control) => control.textContent)).toEqual(
    destructive.map((label) => expect.stringMatching(new RegExp(`^${label}`))),
  );
  for (const control of found) expect(control).toHaveClass("text-red-11");
}

const CARD = "[data-radix-popper-content-wrapper]";

// The named row's Status cell, found by its column header.
async function statusCell(name: string): Promise<HTMLElement> {
  const grid = await screen.findByRole("grid");
  const row = (await within(grid).findAllByRole("row")).find((each) =>
    within(each)
      .queryAllByRole("gridcell")
      .some((cell) => cell.textContent === name),
  );
  if (row === undefined) throw new Error(`no row for ${name}`);
  const column = within(grid)
    .getAllByRole("columnheader")
    .findIndex((header) => /^Status/.test(header.textContent ?? ""));
  const cell = within(row).getAllByRole("gridcell")[column];
  if (cell === undefined) throw new Error("no Status cell");
  return cell;
}

// Badge first, then the body, then the read age last when known.
async function expectOneStatusCard(card: StatusCard) {
  const open = await screen.findByText((_, element) =>
    Boolean(element?.matches(CARD) && element.textContent?.includes(card.body)),
  );
  expect(document.querySelectorAll(CARD)).toHaveLength(1);
  const text = open.textContent ?? "";
  expect(text.startsWith(card.badge)).toBe(true);
  expect(text.indexOf(card.body)).toBeGreaterThanOrEqual(card.badge.length);
  if (card.readAge !== null) expect(text.endsWith(card.readAge)).toBe(true);
}

const SRC = import.meta.dirname;

const sources = readdirSync(SRC, { recursive: true, encoding: "utf8" })
  .filter(
    (file) => /\.tsx?$/.test(file) && !/\.(test|stories)\.tsx?$/.test(file),
  )
  .sort()
  .map((file) => ({ file, text: readFileSync(join(SRC, file), "utf8") }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("every table screen", () => {
  it("is in the guard table", () => {
    const screens = sources
      .filter(
        ({ file, text }) =>
          !file.startsWith("ui/") && /<TableScreen\b/.test(text),
      )
      .map(({ file }) => file);

    expect(screens).toEqual(ON_TABLE_SCREEN.map((row) => row.file).sort());
  });

  // A table in a dialog is not a screen; a table in a panel is.
  it("puts a table in a panel only through TableScreen", () => {
    const byHand = sources
      .filter(
        ({ file, text }) =>
          !file.startsWith("ui/") &&
          /<Panel\b/.test(text) &&
          /<DataTable\b/.test(text),
      )
      .map(({ file }) => file);

    expect(byHand).toEqual([]);
  });

  // #1449: every table row and pane sub-list row opens its ⋮ through RowMenu.
  it("draws the row ⋮ trigger only in ui/row-menu", () => {
    const triggers = sources
      .filter(({ text }) => /\bEllipsisVertical\b/.test(text))
      .map(({ file }) => file);

    expect(triggers).toEqual(["ui/row-menu.tsx"]);
  });

  describe.each(ON_TABLE_SCREEN)("$file", (row) => {
    it("has one Re-read control in band 2 and one status region", async () => {
      row.render();

      expect(
        screen.getByRole("heading", { level: 1, name: row.name }),
      ).toBeInTheDocument();
      const reread = await screen.findByRole("button", {
        name: `Re-read ${row.name}`,
      });
      expect(reread.closest("[data-band='2']")).not.toBeNull();
      expect(
        screen
          .getAllByRole("status")
          .filter((region) => region.classList.contains("sr-only")),
      ).toHaveLength(1);
    });

    // design.md → Frame: one column order, the name taking the rest.
    it("orders its columns checkbox, name, Status, secondary, GitHub, ⋮", async () => {
      (row.card?.render ?? row.render)();

      const grid = await screen.findByRole("grid");
      const headers = within(grid).getAllByRole("columnheader");
      expect(
        headers.map((header) => header.textContent?.replace(/[↑↓]/g, "")),
      ).toEqual(row.columns);
      const name = row.columns.find((column) => !column.startsWith("Select"));
      expect(
        headers
          .filter((header) => header.style.width === "")
          .map((header) => header.textContent?.replace(/[↑↓]/g, ""))
          .filter((column) => !column?.startsWith("Select")),
      ).toEqual([name]);
    });

    it("spins Re-read while a pressed re-read runs", async () => {
      row.render();
      const reread = await screen.findByRole("button", {
        name: `Re-read ${row.name}`,
      });
      await waitFor(() => expect(reread).not.toHaveAttribute("aria-busy"));
      vi.stubGlobal(
        "fetch",
        vi.fn(() => new Promise<Response>(() => {})),
      );

      await userEvent.click(reread);

      await waitFor(() => expect(reread).toHaveAttribute("aria-busy", "true"));
    });
  });

  describe.each(ON_TABLE_SCREEN)("$file rows", ({ leaves }) => {
    // design.md → Keyboard: focus stays visible on something at all times.
    it("hands focus to the row now in a left row's place", async () => {
      const { queryClient } = leaves.render();
      const grid = await screen.findByRole("grid");
      const [name] = await within(grid).findAllByText(leaves.first);
      const row = name?.closest("tr") as HTMLElement;
      // Escape hands focus back to ⋮, in the row about to leave.
      await userEvent.click(
        within(row).getByRole("button", { name: /^Actions for / }),
      );
      await userEvent.keyboard("{Escape}");
      await waitFor(() =>
        expect(
          within(row).getByRole("button", { name: /^Actions for / }),
        ).toHaveFocus(),
      );

      leaves.drop();
      // Not awaited: a read that never answers would hold the test.
      act(() => {
        void queryClient.invalidateQueries();
      });

      await waitFor(() => expect(row).not.toBeInTheDocument());
      const now = screen.getByRole("grid");
      expect(now).toHaveFocus();
      expect(
        document.getElementById(
          now.getAttribute("aria-activedescendant") ?? "",
        ),
      ).toHaveTextContent(leaves.next);
    });
  });

  describe.each(ON_TABLE_SCREEN)("$file row actions", ({ actions }) => {
    const findRow = async () => {
      const [name] = await within(
        await screen.findByRole("grid"),
      ).findAllByText(actions.name);
      return name?.closest("tr") as HTMLElement;
    };

    // design.md → Keyboard: focus stays visible on something at all times.
    it("hands focus to the pane, or back to ⋮, once a ⋮ item's dialog closes", async () => {
      actions.render();
      const trigger = within(await findRow()).getByRole("button", {
        name: /^Actions for /,
      });

      await userEvent.click(trigger);
      await userEvent.click(
        await screen.findByRole("menuitem", { name: actions.item.label }),
      );
      if (actions.item.dialog) {
        await screen.findByRole("dialog");
        await userEvent.keyboard("{Escape}");
        await waitFor(() =>
          expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
        );
      }

      await waitFor(() => {
        if (actions.item.opensPane) {
          expect(screen.getByRole("complementary")).toContainElement(
            document.activeElement as HTMLElement,
          );
        } else {
          expect(trigger).toHaveFocus();
        }
      });
    });

    it("marks every destructive ⋮ and foot item danger", async () => {
      actions.render();
      const row = await findRow();

      await userEvent.click(
        within(row).getByRole("button", { name: /^Actions for / }),
      );
      expectDanger(
        within(await screen.findByRole("menu")).getAllByRole("menuitem"),
        actions.destructive,
      );
      await userEvent.keyboard("{Escape}");

      if (!actions.pane) return;
      await userEvent.click(
        within(row).getAllByRole("gridcell")[0] as HTMLElement,
      );
      expectDanger(
        within(await screen.findByRole("complementary")).getAllByRole("button"),
        actions.destructive,
      );
    });
  });

  const writes = ON_TABLE_SCREEN.flatMap(({ file, name, actions }) =>
    actions.write === null
      ? []
      : [{ file, screenName: name, ...actions.write }],
  );
  type Write = (typeof writes)[number];

  const rowOf = (write: Write) =>
    within(screen.getByRole("grid"))
      .getAllByText(write.name)[0]
      ?.closest("tr") as HTMLElement;
  const menuOf = (write: Write) =>
    within(rowOf(write)).getByRole("button", { name: /^Actions for / });
  // Writes are held once the screen's own reads have landed.
  const readyToWrite = async (write: Write) => {
    write.render();
    await within(await screen.findByRole("grid")).findAllByText(write.name);
    const reread = screen.getByRole("button", {
      name: `Re-read ${write.screenName}`,
    });
    await waitFor(() => expect(reread).not.toHaveAttribute("aria-busy"));
    holdWrites();
  };

  // A busy write shows its spinner in the control that started it.
  describe.each(writes)("$file direct write", (write) => {
    it("spins the row's ⋮ while a write its ⋮ started runs", async () => {
      await readyToWrite(write);

      await userEvent.click(menuOf(write));
      await userEvent.click(
        await screen.findByRole("menuitem", { name: write.item }),
      );

      await waitFor(() =>
        expect(menuOf(write)).toHaveAttribute("aria-busy", "true"),
      );
    });
  });

  describe.each(writes.filter((write) => write.foot))(
    "$file direct write from the pane foot",
    (write) => {
      it("spins the pressed foot button and keeps focus on it", async () => {
        await readyToWrite(write);
        await userEvent.click(
          within(rowOf(write)).getAllByRole("gridcell")[0] as HTMLElement,
        );
        const pane = await screen.findByRole("complementary");

        await userEvent.click(
          within(pane).getByRole("button", { name: write.item }),
        );

        await waitFor(() =>
          expect(document.activeElement).toHaveAttribute("aria-busy", "true"),
        );
        expect(pane).toContainElement(document.activeElement as HTMLElement);
      });
    },
  );

  const carded = ON_TABLE_SCREEN.flatMap(({ file, card }) =>
    card === null ? [] : [{ file, card }],
  );

  describe.each(carded)("$file Status card", ({ card }) => {
    it("opens to the pointer: badge, body, then read age", async () => {
      card.render();

      await userEvent.hover(
        await within(await screen.findByRole("grid")).findByText(card.badge),
      );

      await expectOneStatusCard(card);
    });

    it("opens alone on the keyboard's active row", async () => {
      card.render();
      const grid = await screen.findByRole("grid");
      await within(grid).findByText(card.badge);

      act(() => grid.focus());

      await expectOneStatusCard(card);
    });

    it("reveals a shortened name through the tooltip, not a native title", async () => {
      measureAs(300, 100);
      card.render();

      const name = await within(await screen.findByRole("grid")).findByText(
        card.name,
      );
      await userEvent.hover(name);

      expect(
        await screen.findByRole("tooltip", { hidden: true }),
      ).toHaveTextContent(card.name);
      expect(name).not.toHaveAttribute("title");
    });
  });

  const reading = ON_TABLE_SCREEN.flatMap(({ file, reading }) =>
    reading === null ? [] : [{ file, reading }],
  );

  describe.each(reading)("$file Status cell", ({ reading }) => {
    it("marks a status still being read as busy, with a skeleton past 1.3 s", async () => {
      reading.render();
      const status = await statusCell(reading.name);

      expect(status.querySelector("[aria-busy='true']")).not.toBeNull();
      expect(status.querySelector("[class*='animate-pulse']")).toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      expect(status.querySelector("[class*='animate-pulse']")).not.toBeNull();
    });
  });
});
