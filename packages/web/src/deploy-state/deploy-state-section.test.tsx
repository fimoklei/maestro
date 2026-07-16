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
  // Inviting the user to register a repo lives in the sidebar (SidebarRegister)
  // and the cold-start nudge now — the section no longer duplicates that hint.
  it("shows a loading state, not a register hint, while the registry loads", () => {
    // A fetch that never resolves keeps the query pending.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderSection();

    expect(screen.getByText(/loading registered repos/i)).toBeInTheDocument();
    expect(screen.queryByText(/register a repo/i)).not.toBeInTheDocument();
  });

  it("shows an error, not the register hint, when the registry fails to load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ message: "boom" }, 500)),
    );
    renderSection();

    expect(
      await screen.findByText(/could not load registered repos/i),
    ).toBeInTheDocument();
    // A failed registry read must not masquerade as "no repos registered".
    expect(screen.queryByText(/register a repo/i)).not.toBeInTheDocument();
  });

  it("always renders the Global targets section, even when no repos are registered", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("/api/deploy-state/global")
          ? jsonResponse(
              { tools: [{ tool: "claude", primitives: [] }], skipped: [] },
              200,
            )
          : jsonResponse({ repos: [] }, 200),
      ),
    );
    renderSection();

    // Global is the baseline: its section (and a card for the detected tool) is
    // present regardless of the registry.
    expect(await screen.findByText(/global targets/i)).toBeInTheDocument();
    expect(await screen.findByText("Claude Code")).toBeInTheDocument();
  });

  it("counts detected global tools and registered repos", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("/api/registry/repos")
          ? jsonResponse(
              { repos: [{ path: "/Users/me/a" }, { path: "/Users/me/b" }] },
              200,
            )
          : String(url).includes("/api/deploy-state/global")
            ? jsonResponse(
                {
                  tools: [
                    { tool: "claude", primitives: [] },
                    { tool: "codex", primitives: [] },
                  ],
                  skipped: [],
                },
                200,
              )
            : jsonResponse({ primitives: [], skipped: [] }, 200),
      ),
    );
    renderSection();

    expect(
      await screen.findByText("read from lockfiles · 4 targets"),
    ).toBeInTheDocument();
  });

  it("counts zero targets when no global tools or repos are registered", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("/api/deploy-state/global")
          ? jsonResponse({ tools: [], skipped: [] }, 200)
          : jsonResponse({ repos: [] }, 200),
      ),
    );
    renderSection();

    expect(
      await screen.findByText("read from lockfiles · 0 targets"),
    ).toBeInTheDocument();
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
          : String(url).includes("/api/deploy-state/global")
            ? jsonResponse({ tools: [], skipped: [] }, 200)
            : jsonResponse({ primitives: [], skipped: [] }, 200),
      ),
    );
    renderSection();

    expect(await screen.findByText("/Users/me/a")).toBeInTheDocument();
    expect(screen.getByText("/Users/me/b")).toBeInTheDocument();
  });
});
