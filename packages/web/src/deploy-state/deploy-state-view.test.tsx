import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeployStateView } from "./deploy-state-view";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <DeployStateView />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("DeployStateView cold start", () => {
  it("nudges the first deploy when nothing is deployed and no repos exist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          { repos: [], tools: [], primitives: [], skipped: [], behind: [] },
          200,
        ),
      ),
    );
    renderView();

    expect(
      await screen.findByText(/deploy the first skill/i),
    ).toBeInTheDocument();
  });

  it("does not nudge once a skill is deployed globally", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const target = String(url);
        if (target.includes("/api/deploy-state/global")) {
          return jsonResponse(
            {
              tools: [
                {
                  tool: "claude",
                  primitives: [
                    { type: "skill", name: "tdd", version: "v0.5.0" },
                  ],
                },
              ],
              skipped: [],
            },
            200,
          );
        }
        return jsonResponse({ repos: [], behind: [] }, 200);
      }),
    );
    renderView();

    // The global panel renders its deployed skill, so we know data has loaded.
    expect(await screen.findByText("tdd")).toBeInTheDocument();
    expect(
      screen.queryByText(/deploy the first skill/i),
    ).not.toBeInTheDocument();
  });
});
