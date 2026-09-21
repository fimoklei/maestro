import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { Sidebar } from "./sidebar";

afterEach(() => {
  vi.unstubAllGlobals();
});

const HARNESS_STATE = {
  origin: "github.com/fimoklei/agent-harness",
  releasedVersion: "v0.5.0",
  defaultBranch: "main",
  releaseState: "released",
  freshness: { outcome: null, lastFetchedAt: null },
  stages: {
    proposal: { outcome: "read", rows: [], bound: null },
    review: { outcome: "read", rows: [], bound: null },
    release: { outcome: "read", rows: [], bound: null },
  },
};

function stubServer({
  inventoryPath = "/home/me/agent-harness",
  primitives = [
    { type: "skill", name: "tdd", description: "" },
    { type: "skill", name: "review", description: "" },
  ],
}: {
  inventoryPath?: string | null;
  primitives?: unknown[];
} = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/inventory/config")) {
        return jsonResponse({ inventoryPath, githubRepository: null }, 200);
      }
      if (url.startsWith("/api/inventory/primitives")) {
        return jsonResponse({ primitives }, 200);
      }
      if (url.startsWith("/api/harness")) {
        return jsonResponse(HARNESS_STATE, 200);
      }
      return jsonResponse(
        { ok: true, repos: [], primitives: [], skipped: [], behind: [] },
        200,
      );
    }),
  );
}

function renderSidebar(path = "/") {
  return renderWithQuery(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar />
    </MemoryRouter>,
  );
}

describe("Sidebar", () => {
  it("names its landmark so it is distinct from the skill detail pane's aside", () => {
    stubServer();
    renderSidebar();

    expect(
      screen.getByRole("complementary", { name: "Navigation" }),
    ).toBeInTheDocument();
  });

  it("reaches every screen in one click", async () => {
    // One block for what you deploy from, one for what you author (#991).
    stubServer();
    renderSidebar();

    const consume = screen.getByRole("navigation", { name: "Screens" });
    for (const name of ["Deploy-state", "Inventory", "Repositories"]) {
      expect(within(consume).getByRole("button", { name })).toBeEnabled();
    }

    const author = screen.getByRole("navigation", { name: "Author" });
    expect(
      within(author).getByRole("button", { name: "Harness" }),
    ).toBeInTheDocument();
    expect(
      within(author).queryByRole("button", { name: "Inventory" }),
    ).not.toBeInTheDocument();
  });

  it("names the Harness, its release and its skill count on the menu button", async () => {
    stubServer();
    renderSidebar();

    expect(await screen.findByText("v0.5.0 · 2 skills")).toBeInTheDocument();
    expect(screen.getByText("…/me/agent-harness")).toHaveAttribute(
      "title",
      "/home/me/agent-harness",
    );
  });

  it("opens the Harness location from the Harness menu", async () => {
    stubServer();
    renderSidebar();

    await userEvent.click(
      await screen.findByRole("button", { name: /harness menu/i }),
    );

    expect(
      await screen.findByRole("menuitem", { name: "Harness location" }),
    ).toBeInTheDocument();
  });

  it("carries no Targets list and no register affordance of its own", async () => {
    // Targets are read on Deploy-state; registering moved to Repositories
    // (#991).
    stubServer();
    renderSidebar();

    await screen.findByText("v0.5.0 · 2 skills");
    expect(
      screen.queryByRole("list", { name: /targets/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "+ repo" }),
    ).not.toBeInTheDocument();
  });

  it("states the missing release where the Harness has none yet", async () => {
    stubServer();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/inventory/config")) {
          return jsonResponse(
            { inventoryPath: "/home/me/agent-harness", githubRepository: null },
            200,
          );
        }
        if (url.startsWith("/api/inventory/primitives")) {
          return jsonResponse({ primitives: [] }, 200);
        }
        if (url.startsWith("/api/harness")) {
          return jsonResponse({ ...HARNESS_STATE, releasedVersion: null }, 200);
        }
        return jsonResponse({ ok: true, repos: [] }, 200);
      }),
    );
    renderSidebar();

    expect(
      await screen.findByText("No release · 0 skills"),
    ).toBeInTheDocument();
  });
});
