import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeployStateSection } from "./deploy-state-section";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DeployStateSection />
    </QueryClientProvider>,
  );
}

describe("DeployStateSection", () => {
  it("invites the user to register a repo when none are registered", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ repos: [] }, 200)),
    );
    renderSection();

    expect(await screen.findByText(/register a repo/i)).toBeInTheDocument();
  });

  it("shows a loading state, not the register hint, while the registry loads", () => {
    // A fetch that never resolves keeps the query pending.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderSection();

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByText(/register a repo/i)).not.toBeInTheDocument();
  });

  it("shows an error, not the register hint, when the registry fails to load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ message: "boom" }, 500)),
    );
    renderSection();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    // A failed registry read must not masquerade as "no repos registered".
    expect(screen.queryByText(/register a repo/i)).not.toBeInTheDocument();
  });

  it("shows a deploy-state panel for each registered repo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("/api/registry/repos")
          ? jsonResponse(
              { repos: [{ path: "/Users/me/a" }, { path: "/Users/me/b" }] },
              200,
            )
          : jsonResponse({ primitives: [], skipped: [] }, 200),
      ),
    );
    renderSection();

    expect(await screen.findByText("/Users/me/a")).toBeInTheDocument();
    expect(screen.getByText("/Users/me/b")).toBeInTheDocument();
  });
});
