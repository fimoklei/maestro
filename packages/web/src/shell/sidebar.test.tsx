import type { HarnessState } from "@maestro/core";
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
  cloneSync: "current",
  localHeadCommit: null,
  stages: {
    proposal: { outcome: "read", rows: [], bound: null },
    review: { outcome: "read", rows: [], bound: null },
    release: { outcome: "read", rows: [], bound: null },
  },
} satisfies HarnessState;

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
    for (const name of ["Deploy-state", "Repositories"]) {
      expect(within(consume).getByRole("button", { name })).toBeEnabled();
    }

    // Inventory is a headed group of views, between the screens and Author.
    const inventory = screen.getByRole("navigation", { name: "Inventory" });
    expect(
      within(inventory).getByRole("button", { name: "Skills" }),
    ).toBeEnabled();
    expect(
      within(consume).queryByRole("button", { name: "Inventory" }),
    ).not.toBeInTheDocument();

    const author = screen.getByRole("navigation", { name: "Author" });
    expect(
      within(author).getByRole("button", { name: "Harness" }),
    ).toBeInTheDocument();
    expect(
      within(author).queryByRole("button", { name: "Skills" }),
    ).not.toBeInTheDocument();
  });

  it("names the Harness and its release alone on the menu button", async () => {
    stubServer();
    renderSidebar();

    expect(await screen.findByText("v0.5.0")).toHaveClass("font-mono");
    const button = screen.getByRole("button", { name: /harness menu/i });
    expect(button).not.toHaveTextContent(/skill/);
    expect(screen.getByText("…/me/agent-harness")).toHaveAttribute(
      "title",
      "/home/me/agent-harness",
    );
  });

  it("marks the Harness with the first letter of its folder name", async () => {
    stubServer();
    renderSidebar();

    const button = await screen.findByRole("button", { name: /harness menu/i });
    expect(await within(button).findByText("A")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("reads no Inventory to summarise the Harness", async () => {
    stubServer();
    renderSidebar();

    await screen.findByText("v0.5.0");
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) =>
          String(url).startsWith("/api/inventory/primitives"),
        ),
    ).toBe(false);
  });

  it("states no Harness and no letter while none is connected", async () => {
    stubServer({ inventoryPath: null });
    renderSidebar();

    const button = await screen.findByRole("button", { name: /harness menu/i });
    expect(
      await within(button).findByText("No Harness connected"),
    ).toBeInTheDocument();
    expect(button.querySelector("[aria-hidden='true'] + *")).toBeNull();
    expect(within(button).queryByText(/^[A-Z]$/)).not.toBeInTheDocument();
  });

  it("holds Settings in the Harness menu", async () => {
    stubServer();
    renderSidebar();

    await userEvent.click(
      await screen.findByRole("button", { name: /harness menu/i }),
    );

    expect(
      await screen.findByRole("menuitem", { name: "Settings" }),
    ).toBeInTheDocument();
  });

  it("does not repeat the Harness name inside its menu", async () => {
    stubServer();
    renderSidebar();

    await userEvent.click(
      await screen.findByRole("button", { name: /harness menu/i }),
    );

    expect(
      within(await screen.findByRole("menu")).queryByText("…/me/agent-harness"),
    ).not.toBeInTheDocument();
  });

  it("carries no Targets list and no register affordance of its own", async () => {
    stubServer();
    renderSidebar();

    await screen.findByText("v0.5.0");
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

    expect(await screen.findByText("Not released yet")).toBeInTheDocument();
  });
});
