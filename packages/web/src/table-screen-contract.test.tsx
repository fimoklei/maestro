import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

type Row = {
  /** The screen's source, from `packages/web/src`. */
  file: string;
  name: string;
  render: () => void;
  /** Null for a screen without a hover card. */
  card: StatusCard | null;
  actions: RowActions;
};

/** One row whose ⋮ menu, and pane foot where the screen has a pane, the checks open. */
type RowActions = {
  render: () => void;
  name: string;
  /** Every destructive item the row offers, in ⋮ order. */
  destructive: string[];
  pane: boolean;
};

const renderInventoryRow = () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => {})),
  );
  renderWithQuery(
    <InventoryView
      primitives={[{ type: "skill", name: "tdd", description: "Test first." }]}
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

const ON_TABLE_SCREEN: Row[] = [
  {
    file: "deploy-state/deploy-state-view.tsx",
    name: "Deploy-state",
    render: () => {
      stubServer(() => ({ repos: ["/Users/me/a"] }));
      renderDeployState();
    },
    card: {
      render: () => {
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
      },
      name: "…/me/a",
      badge: "Behind",
      body: "2 of 5 deployed skills changed in v0.3.4.",
      readAge: "Read just now",
    },
    // A target row removes nothing; its skills' removal sits in the pane's sub-list.
    actions: {
      render: () => {
        stubServer(() => ({ repos: ["/Users/me/a"] }));
        renderDeployState();
      },
      name: "…/me/a",
      destructive: [],
      pane: true,
    },
  },
  {
    file: "harness/harness-view.tsx",
    name: "Harness",
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
    },
  },
  {
    file: "inventory/inventory-view.tsx",
    name: "Inventory",
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
    actions: {
      render: renderInventoryRow,
      name: "tdd",
      destructive: ["Delete skill"],
      pane: true,
    },
  },
  {
    file: "registry/repositories-view.tsx",
    name: "Repositories",
    render: () => {
      stubRegistry({ repos: [{ path: "/home/me/acme-web", status: "ready" }] });
      renderRepositories();
    },
    card: null,
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

  describe.each(ON_TABLE_SCREEN)("$file row actions", ({ actions }) => {
    it("marks every destructive ⋮ and foot item danger", async () => {
      actions.render();
      const [name] = await within(
        await screen.findByRole("grid"),
      ).findAllByText(actions.name);
      const row = name?.closest("tr") as HTMLElement;

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
});
