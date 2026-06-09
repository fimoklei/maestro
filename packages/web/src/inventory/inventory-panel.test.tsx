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

describe("InventoryPanel", () => {
  it("lists every central skill with its name and description", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            primitives: [
              { type: "skill", name: "tdd", description: "TDD loop" },
              {
                type: "skill",
                name: "diagnose",
                description: "Diagnosis loop",
              },
            ],
          },
          200,
        ),
      ),
    );
    renderPanel();

    expect(await screen.findByText("tdd")).toBeInTheDocument();
    expect(screen.getByText("TDD loop")).toBeInTheDocument();
    expect(screen.getByText("diagnose")).toBeInTheDocument();
    expect(screen.getByText("Diagnosis loop")).toBeInTheDocument();
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
