import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRereadInventory } from "../shell/use-reread-inventory";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { InventoryPanel } from "./inventory-panel";

// Drops the cached read the way the Harness location screen's own button does,
// so the panel is asked to render a failure over content it already showed.
function RereadTrigger() {
  const reread = useRereadInventory();
  return (
    <button type="button" onClick={reread}>
      Force re-read
    </button>
  );
}

// Deploy moved from the row into the detail pane (ADR-0016), so opening the pane
// is the precondition for asserting anything about its deploy control. Returns
// the pane's scope — the standing strip above the table shares its labels (#473).
async function openPane(name: string) {
  await userEvent.click(await screen.findByRole("button", { name }));
  return within(await screen.findByRole("complementary"));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPanel() {
  return renderWithQuery(
    <MemoryRouter initialEntries={["/inventory"]}>
      <InventoryPanel />
    </MemoryRouter>,
  );
}

// Routes by URL: inventory, registry (deploy repo choice), and each target's
// deploy-state (deployed-column roll-up). Returns the real shape with `skipped`.
function stubApi(primitives: unknown[], repos: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/registry")) {
        return jsonResponse({ repos }, 200);
      }
      if (url.startsWith("/api/deploy-state")) {
        return jsonResponse({ primitives: [], skipped: [] }, 200);
      }
      return jsonResponse({ primitives }, 200);
    }),
  );
}

describe("InventoryPanel", () => {
  it("titles the page with a single h1", async () => {
    // Heading navigation has no starting point without one, and the section
    // header underneath it (SectionHeader) defaults to h2 for every other
    // view — this route needs to opt in explicitly (ADR-0015 precedent).
    stubApi([{ type: "skill", name: "tdd", description: "TDD loop" }], []);
    renderPanel();

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: /^inventory$/i,
      }),
    ).toBeInTheDocument();
  });

  it("lists every central skill with its name and description", async () => {
    stubApi(
      [
        { type: "skill", name: "tdd", description: "TDD loop" },
        { type: "skill", name: "diagnose", description: "Diagnosis loop" },
      ],
      [],
    );
    renderPanel();

    expect(await screen.findByText("tdd")).toBeInTheDocument();
    expect(screen.getByText("TDD loop")).toBeInTheDocument();
    expect(screen.getByText("diagnose")).toBeInTheDocument();
    expect(screen.getByText("Diagnosis loop")).toBeInTheDocument();
  });

  it("shows a type tag on each skill row", async () => {
    // The view is type-aware (TypeTag per primitive) though only skills render
    // today, so a future hook/mcp/bundle slots in additively (#80).
    stubApi(
      [
        { type: "skill", name: "tdd", description: "TDD loop" },
        { type: "skill", name: "diagnose", description: "Diagnosis loop" },
      ],
      [],
    );
    renderPanel();

    await screen.findByText("tdd");
    expect(screen.getAllByText("skill")).toHaveLength(2);
  });

  it("exposes the skills as a table, one row per skill", async () => {
    // The inventory is a real table, so it keeps table semantics for
    // assistive tech (frontend.md a11y baseline) — not generic divs (#80,
    // Codex P2; table shape per #285).
    stubApi(
      [
        { type: "skill", name: "tdd", description: "TDD loop" },
        { type: "skill", name: "diagnose", description: "Diagnosis loop" },
      ],
      [],
    );
    renderPanel();

    await screen.findByText("tdd");
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3); // header + 2 skills
  });

  it("offers a deploy action with a repo choice in the detail pane", async () => {
    stubApi(
      [{ type: "skill", name: "tdd", description: "TDD loop" }],
      [{ path: "/projects/alpha" }],
    );
    renderPanel();

    const pane = await openPane("tdd");

    expect(
      await screen.findByLabelText(/deploy target for tdd/i),
    ).toBeInTheDocument();
    expect(pane.getByRole("button", { name: /deploy/i })).toBeEnabled();
  });

  it("disables the deploy action while the registry is still loading", async () => {
    // Inventory resolves, registry never does: the button must wait for the
    // registry instead of treating "not loaded yet" as "no repos" (#37).
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).startsWith("/api/registry")
          ? new Promise<Response>(() => undefined)
          : jsonResponse(
              {
                primitives: [
                  { type: "skill", name: "tdd", description: "TDD loop" },
                ],
              },
              200,
            ),
      ),
    );
    renderPanel();

    const pane = await openPane("tdd");

    expect(
      await pane.findByRole("button", { name: /loading targets/i }),
    ).toBeDisabled();
  });

  it("holds the deployed column unresolved while the registry is still loading", async () => {
    // The repo set is unknown until the registry resolves, so a skill's repo
    // reach is unconfirmed — the column must not read a definite "Not deployed"
    // (J04), the same honesty the deploy button keeps.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).startsWith("/api/registry")
          ? new Promise<Response>(() => undefined)
          : jsonResponse(
              {
                primitives: [
                  { type: "skill", name: "tdd", description: "TDD loop" },
                ],
              },
              200,
            ),
      ),
    );
    renderPanel();

    await screen.findByText("tdd");
    expect(screen.queryByText("Not deployed")).not.toBeInTheDocument();
    expect(screen.getByText("Loading deploy-state…")).toBeInTheDocument();
  });

  it("disables the deploy action when the registry failed to load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).startsWith("/api/registry")
          ? jsonResponse({ message: "boom" }, 500)
          : jsonResponse(
              {
                primitives: [
                  { type: "skill", name: "tdd", description: "TDD loop" },
                ],
              },
              200,
            ),
      ),
    );
    renderPanel();

    const pane = await openPane("tdd");

    expect(
      await pane.findByRole("button", { name: /loading targets/i }),
    ).toBeDisabled();
  });

  it("shows an actionable message when the inventory is not configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ error: "not-configured", message: "irrelevant" }, 409),
      ),
    );
    renderPanel();

    // A panel that failed to load announces politely: nothing here followed a
    // click, so role="status", never the assertive region (#465, decision 11).
    expect(await screen.findByRole("status")).toHaveTextContent(
      /No Harness connected/i,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("offers the Harness from the empty state when nothing is released", async () => {
    stubApi([], []);
    renderPanel();

    expect(await screen.findByText("No released skills")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Inventory shows skills from the latest release. Open Harness, then create a release to add skills.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open Harness" }),
    ).toBeInTheDocument();
  });

  it("shows the read failure with its own recovery when the release cannot be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "unreadable" }, 503)),
    );
    renderPanel();

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent("Could not read Inventory");
    expect(notice).toHaveTextContent("Select Re-read Inventory to try again.");
    expect(
      within(notice).getByRole("button", { name: "Re-read Inventory" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a generic load error for other failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ message: "boom" }, 500)),
    );
    renderPanel();

    expect(await screen.findByRole("status")).toHaveTextContent(
      /Could not read Inventory/i,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // A cached list would still be the working tree's answer to a question the
  // release never answered (#841).
  it("hides the rows and the count once a later read fails", async () => {
    let fail = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/registry")) return jsonResponse({ repos: [] });
        if (url.startsWith("/api/deploy-state"))
          return jsonResponse({ primitives: [], skipped: [] });
        return fail
          ? jsonResponse({ error: "unreadable" }, 503)
          : jsonResponse({
              primitives: [
                { type: "skill", name: "tdd", description: "TDD loop" },
              ],
            });
      }),
    );
    renderWithQuery(
      <MemoryRouter initialEntries={["/inventory"]}>
        <InventoryPanel />
        <RereadTrigger />
      </MemoryRouter>,
    );
    expect(await screen.findByText("tdd")).toBeInTheDocument();
    expect(screen.getByText("1 skill")).toBeInTheDocument();

    fail = true;
    await userEvent.click(
      screen.getByRole("button", { name: "Force re-read" }),
    );

    expect(
      await screen.findByText("Could not read Inventory"),
    ).toBeInTheDocument();
    expect(screen.queryByText("tdd")).not.toBeInTheDocument();
    expect(screen.queryByText("1 skill")).not.toBeInTheDocument();
  });
});
