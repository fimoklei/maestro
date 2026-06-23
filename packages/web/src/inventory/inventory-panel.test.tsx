import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InventoryPanel } from "./inventory-panel";

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

// Routes the fetch stub by URL: the panel reads both the inventory and the
// registry (for the per-row deploy action's repo choice).
function stubApi(primitives: unknown[], repos: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) =>
      String(input).startsWith("/api/registry")
        ? jsonResponse({ repos }, 200)
        : jsonResponse({ primitives }, 200),
    ),
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

  it("offers a deploy action with a repo choice on every skill row", async () => {
    stubApi(
      [{ type: "skill", name: "tdd", description: "TDD loop" }],
      [{ path: "/projects/alpha" }],
    );
    renderPanel();

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

    expect(
      await screen.findByRole("button", { name: /loading targets/i }),
    ).toBeDisabled();
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
