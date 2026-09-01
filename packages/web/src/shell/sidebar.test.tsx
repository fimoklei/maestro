import { screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { Sidebar } from "./sidebar";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubServer({ notConfigured }: { notConfigured: boolean }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) =>
      String(input).startsWith("/api/inventory/config")
        ? jsonResponse(
            { inventoryPath: notConfigured ? null : "/home/me/agent-harness" },
            200,
          )
        : jsonResponse(
            { ok: true, repos: [], primitives: [], skipped: [], behind: [] },
            200,
          ),
    ),
  );
}

function renderSidebar(path = "/welcome") {
  return renderWithQuery(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar />
    </MemoryRouter>,
  );
}

describe("Sidebar", () => {
  it("names its landmark so it's distinct from the skill detail pane's aside", () => {
    // Two <aside> elements on /inventory (this one and the skill detail
    // pane) need distinct accessible names, or a screen reader's landmark
    // list can't tell them apart.
    stubServer({ notConfigured: true });
    renderSidebar();

    expect(
      screen.getByRole("complementary", { name: /navigation and targets/i }),
    ).toBeInTheDocument();
  });
});

describe("Sidebar grouping", () => {
  it("keeps the author's Harness out of the consumer-facing views", async () => {
    // Authoring state must not compete with Inventory, so the nav is grouped
    // rather than one flat list (ADR-0021, #516).
    stubServer({ notConfigured: false });
    renderSidebar("/");

    expect(
      await screen.findByRole("navigation", { name: /consume/i }),
    ).toBeInTheDocument();
    const author = screen.getByRole("navigation", { name: /author/i });
    expect(
      within(author).getByRole("button", { name: "Harness" }),
    ).toBeInTheDocument();
    expect(
      within(author).queryByRole("button", { name: "Inventory" }),
    ).not.toBeInTheDocument();
  });

  it("dims the Harness with the rest of the nav on a first run", async () => {
    stubServer({ notConfigured: true });
    renderSidebar();

    // The empty state is the tell that the first-run read has landed; asserting
    // before it would catch the nav in its pre-read, enabled state.
    await screen.findByText(/no targets yet/i);
    expect(screen.getByRole("button", { name: "Harness" })).toBeDisabled();
  });
});

describe("Sidebar first-run rendering", () => {
  it("dims the nav, hides register, and shows the empty state when unconfigured", async () => {
    stubServer({ notConfigured: true });
    renderSidebar();

    expect(await screen.findByText(/no targets yet/i)).toBeInTheDocument();
    for (const name of ["Deploy-state", "Inventory"]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
    // Harness location lives in the header now (issue #109), not the sidebar.
    expect(
      screen.queryByRole("button", { name: "Harness location" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "+ repo" }),
    ).not.toBeInTheDocument();
  });

  it("marks itself hidden below md on a gate route", async () => {
    stubServer({ notConfigured: true });
    renderSidebar("/welcome/connect");

    await screen.findByText(/no targets yet/i);

    expect(
      screen.getByRole("complementary", { name: /navigation and targets/i }),
    ).toHaveClass("max-md:hidden");
  });

  it("renders the interactive nav and register affordance when configured", async () => {
    stubServer({ notConfigured: false });
    renderSidebar("/");

    expect(
      await screen.findByRole("button", { name: "+ repo" }),
    ).toBeInTheDocument();
    for (const name of ["Deploy-state", "Inventory"]) {
      expect(screen.getByRole("button", { name })).toBeEnabled();
    }
    expect(
      screen.queryByRole("button", { name: "Harness location" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/no targets yet/i)).not.toBeInTheDocument();
  });

  it("hides the register affordance on a gate route even when configured", async () => {
    // Connect success flips firstRun to false while the user is still reading
    // the gate's confirmation; `+ repo` appearing mid-beat competes with the
    // one action that screen offers (ADR-0015).
    stubServer({ notConfigured: false });
    renderSidebar("/welcome/connect");

    expect(
      await screen.findByRole("button", { name: "Deploy-state" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "+ repo" }),
    ).not.toBeInTheDocument();
  });
});
