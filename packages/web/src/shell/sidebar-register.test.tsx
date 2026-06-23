import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "./sidebar";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// A stateful registry: empty until a POST registers a repo, after which the
// list (and so the Targets list) refetches it. Drift checks resolve to in-sync
// and deploy-state to nothing deployed, so each target reads as in sync.
function stubStatefulRegistry() {
  let repos: { path: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const target = String(url);
      if (target.includes("/api/registry/repos")) {
        if (init?.method === "POST") {
          const { path } = JSON.parse(String(init.body));
          repos = [{ path }];
        }
        return jsonResponse({ repos }, 200);
      }
      if (target.includes("/api/deploy-state")) {
        return jsonResponse({ primitives: [], skipped: [] }, 200);
      }
      if (target.includes("/api/drift")) {
        return jsonResponse({ behind: [] }, 200);
      }
      return jsonResponse({}, 200);
    }),
  );
}

function renderSidebar() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <Sidebar />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("sidebar inline register", () => {
  it("adds a registered repo to the Targets list", async () => {
    stubStatefulRegistry();
    renderSidebar();

    await userEvent.type(
      screen.getByLabelText(/repo path/i),
      "/Users/me/new-repo",
    );
    await userEvent.click(screen.getByRole("button", { name: /register/i }));

    expect(await screen.findByText("/Users/me/new-repo")).toBeInTheDocument();
  });
});
