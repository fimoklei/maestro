import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
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
        <Routes>
          <Route path="/" element={<DeployStateView />} />
          <Route path="/inventory" element={<p>inventory view</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// Serves both the empty registry and the empty global deploy-state, which is
// the cold start: nothing deployed anywhere and no repo registered.
function stubColdStart() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      jsonResponse(
        { repos: [], tools: [], primitives: [], skipped: [], behind: [] },
        200,
      ),
    ),
  );
}

function stubEmptyTargets() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const target = String(url);
      if (target.includes("/api/registry/repos")) {
        return jsonResponse({ repos: [{ path: "/Users/me/project" }] }, 200);
      }
      if (target.includes("/api/deploy-state/global")) {
        return jsonResponse(
          {
            tools: [
              { tool: "claude", primitives: [] },
              { tool: "codex", primitives: [] },
            ],
            skipped: [],
          },
          200,
        );
      }
      if (target.includes("/api/deploy-state")) {
        return jsonResponse({ primitives: [], skipped: [] }, 200);
      }
      return jsonResponse({ behind: [] }, 200);
    }),
  );
}

describe("DeployStateView cold start", () => {
  it("states plainly that nothing is deployed instead of counting targets", async () => {
    stubColdStart();
    renderView();

    expect(await screen.findByText("nothing deployed")).toBeInTheDocument();
  });

  it("offers a deploy action in every confirmed-empty target", async () => {
    stubEmptyTargets();
    renderView();

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "deploy →" })).toHaveLength(
        3,
      );
    });
  });

  it("starts a deploy from an empty target without the sidebar", async () => {
    stubEmptyTargets();
    renderView();

    const [action] = await screen.findAllByRole("button", {
      name: "deploy →",
    });
    if (!action) {
      throw new Error("Expected an empty-target deploy action.");
    }

    await userEvent.click(action);

    expect(screen.getByText("inventory view")).toBeInTheDocument();
  });

  it("does not offer a target deploy action once a skill is deployed globally", async () => {
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
    expect(screen.queryByRole("button", { name: "deploy →" })).toBeNull();
  });
});

describe("DeployStateView heading structure", () => {
  // The view title owns both target kinds. Global targets and Repositories are
  // its parts, not its peers — so they nest under it and rank below it, and the
  // page's outline reads the same way the screen looks.
  it("ranks both target kinds below the view title", async () => {
    stubColdStart();
    renderView();

    expect(
      await screen.findByRole("heading", { level: 2, name: /deploy-state/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: /global targets/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: /repositories/i }),
    ).toBeInTheDocument();
  });
});

describe("DeployStateView sections", () => {
  it("does not count targets before both reads have landed", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderView();

    // An unread target set is not a target set of zero.
    expect(screen.queryByText(/\d+ targets?/)).toBeNull();
  });

  it("shows a loading state, not a register hint, while the registry loads", () => {
    // A fetch that never resolves keeps the query pending.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderView();

    expect(screen.getByText(/loading registered repos/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/no repositories registered yet/i),
    ).not.toBeInTheDocument();
  });

  it("shows an error, not the register hint, when the registry fails to load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ message: "boom" }, 500)),
    );
    renderView();

    expect(
      await screen.findByText(
        "Could not load registered repos. Reload the page to try again.",
      ),
    ).toBeInTheDocument();
    // A failed registry read must not masquerade as "no repos registered".
    expect(
      screen.queryByText(/no repositories registered yet/i),
    ).not.toBeInTheDocument();
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
    renderView();

    // Global is the baseline: its section (and a card for the detected tool) is
    // present regardless of the registry.
    expect(await screen.findByText(/global targets/i)).toBeInTheDocument();
    expect(await screen.findByText("Claude Code")).toBeInTheDocument();
  });

  it("counts detected global tools and registered repos once something is deployed", async () => {
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
    renderView();

    expect(await screen.findByText("4 targets")).toBeInTheDocument();
  });

  it("gives registered repos their own section, naming where they come from when there are none", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("/api/deploy-state/global")
          ? jsonResponse({ tools: [], skipped: [] }, 200)
          : jsonResponse({ repos: [] }, 200),
      ),
    );
    renderView();

    const meta = await screen.findByText(/none registered/i);
    const heading = screen.getByRole("heading", { name: /repositories/i });
    // The meta belongs to the Repositories heading, so the empty registry reads
    // as a state of that section rather than a stray line under Global targets.
    expect(heading.parentElement).toContainElement(meta);
    expect(
      screen.getByText(/no repositories registered yet/i),
    ).toBeInTheDocument();
  });

  it("drops the sidebar hint once a repo is registered", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("/api/registry/repos")
          ? jsonResponse({ repos: [{ path: "/Users/me/a" }] }, 200)
          : String(url).includes("/api/deploy-state/global")
            ? jsonResponse({ tools: [], skipped: [] }, 200)
            : jsonResponse({ primitives: [], skipped: [] }, 200),
      ),
    );
    renderView();

    // The card labels the repo by its path tail; its full path is the title (#211).
    expect(await screen.findByTitle("/Users/me/a")).toBeInTheDocument();
    expect(
      screen.queryByText(/no repositories registered yet/i),
    ).not.toBeInTheDocument();
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
    renderView();

    // Two repos sharing the "/Users/me" prefix must render as distinct cards;
    // the tail-based label keeps them apart, the full path lives in the title (#211).
    expect(await screen.findByTitle("/Users/me/a")).toBeInTheDocument();
    expect(screen.getByTitle("/Users/me/b")).toBeInTheDocument();
  });

  it("labels two clones that share their tail with distinct, longer labels", async () => {
    // Both cards share their last two segments (repos/agent-harness); only the
    // whole registered set can tell them apart, so the view must feed each card
    // its siblings and the labels must extend until they differ (#211).
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("/api/registry/repos")
          ? jsonResponse(
              {
                repos: [
                  { path: "/Users/me/clientA/repos/agent-harness" },
                  { path: "/Users/me/clientB/repos/agent-harness" },
                ],
              },
              200,
            )
          : String(url).includes("/api/deploy-state/global")
            ? jsonResponse({ tools: [], skipped: [] }, 200)
            : jsonResponse({ primitives: [], skipped: [] }, 200),
      ),
    );
    renderView();

    expect(
      await screen.findByText("…/clientA/repos/agent-harness"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("…/clientB/repos/agent-harness"),
    ).toBeInTheDocument();
  });
});
