import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InventoryPanel } from "./inventory-panel";

// Deploy moved from the row into the detail pane (ADR-0016), so the deploy control
// only exists once a skill's row is selected. Opening the pane is the precondition
// for asserting anything about that control.
async function openPane(name: string) {
  await userEvent.click(await screen.findByRole("button", { name }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <InventoryPanel />
    </QueryClientProvider>,
  );
}

// Routes the fetch stub by URL: the panel reads the inventory, the registry (for
// the per-row deploy action's repo choice), and — for the deployed column's
// roll-up — each target's deploy-state. A deploy-state response always carries a
// `skipped` list, so the stub returns the real shape, not a primitives-only stub.
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

    await openPane("tdd");

    expect(await screen.findByLabelText(/deploy tdd to/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /deploy/i })).toBeEnabled();
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

    await openPane("tdd");

    expect(
      await screen.findByRole("button", { name: /loading targets/i }),
    ).toBeDisabled();
  });

  it("holds the deployed column unresolved while the registry is still loading", async () => {
    // The repo set is unknown until the registry resolves, so a skill's repo
    // reach is unconfirmed — the column must not read a definite "not deployed"
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
    expect(screen.queryByText("not deployed")).not.toBeInTheDocument();
    expect(screen.getByText("…")).toBeInTheDocument();
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

    await openPane("tdd");

    expect(
      await screen.findByRole("button", { name: /loading targets/i }),
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

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no inventory is configured/i,
    );
  });

  it("shows a generic load error for other failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ message: "boom" }, 500)),
    );
    renderPanel();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /could not load/i,
    );
  });
});
