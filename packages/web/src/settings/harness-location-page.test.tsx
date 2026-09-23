import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../test-utils";
import { renderPage, skill, stubServer } from "./harness-location-test-helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

const failed = () => jsonResponse({ error: "unreadable" }, 503);
const held = () => {
  let resolve: (response: Response) => void = () => {};
  const answer = new Promise<Response>((done) => {
    resolve = done;
  });
  return { answer, resolve };
};
const skills = (count: number) =>
  jsonResponse({
    primitives: Array.from({ length: count }, (_, i) => skill(`s${i}`)),
  });

const connected = () =>
  screen.getByRole("region", { name: "Connected Harness" });
const reread = () =>
  within(connected()).getByRole("button", { name: "Re-read Inventory" });

describe("Harness location page", () => {
  it("holds its title on screen while the location is still being read", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "Harness location" }),
    ).toBeInTheDocument();
  });

  it("states the local clone, the GitHub repository and the latest release", async () => {
    stubServer();
    renderPage();

    const section = connected();
    expect(
      await within(section).findByText("v1.4.0 · 2 skills"),
    ).toBeInTheDocument();
    expect(within(section).getByText("Local clone")).toBeInTheDocument();
    expect(within(section).getByText("/home/me/agent-harness")).toHaveAttribute(
      "title",
      "/home/me/agent-harness",
    );
    expect(within(section).getByText("GitHub repository")).toBeInTheDocument();
    expect(within(section).getByText("fimoklei/agent-harness")).toHaveAttribute(
      "title",
      "fimoklei/agent-harness",
    );
    expect(within(section).getByText("Latest release")).toBeInTheDocument();
    // No fake sync timestamp, and the count pill of the old view is gone.
    expect(screen.queryByText(/synced/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/●/)).not.toBeInTheDocument();
  });

  it("keeps full long clone and repository values available on hover", async () => {
    const clone = "/home/me/workspaces/very-long-team-name/agent-harness";
    const repository = "very-long-organization-name/very-long-harness-name";
    stubServer({ inventoryPath: clone, githubRepository: repository });
    renderPage();

    expect(await screen.findByText(repository)).toHaveAttribute(
      "title",
      repository,
    );
    expect(screen.getByText(clone)).toHaveAttribute("title", clone);
  });

  it("keeps the local clone and says when the GitHub repository was not read", async () => {
    stubServer({ githubRepository: null });
    renderPage();

    expect(
      await screen.findByText("/home/me/agent-harness"),
    ).toBeInTheDocument();
    expect(screen.getByText("GitHub repository not read")).toBeInTheDocument();
  });

  it("singularises a lone skill", async () => {
    stubServer({ primitives: () => skills(1) });
    renderPage();

    expect(await screen.findByText("v1.4.0 · 1 skill")).toBeInTheDocument();
  });

  it("states the release alone while the count is still being read, never 'undefined'", async () => {
    stubServer({ primitives: () => new Promise<Response>(() => {}) });
    renderPage();

    expect(await screen.findByText("v1.4.0")).toBeInTheDocument();
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
  });

  it("offers Re-read Inventory beside the facts it refreshes", async () => {
    let reads = 0;
    stubServer({ primitives: () => skills(++reads === 1 ? 2 : 5) });
    renderPage();

    expect(await screen.findByText("v1.4.0 · 2 skills")).toBeInTheDocument();
    await userEvent.click(reread());

    expect(await screen.findByText("v1.4.0 · 5 skills")).toBeInTheDocument();
  });

  it("reads the release again with the Inventory", async () => {
    const { fetchMock } = stubServer();
    renderPage();
    await screen.findByText("v1.4.0 · 2 skills");
    const harnessReads = () =>
      fetchMock.mock.calls.filter(([url]) => String(url) === "/api/harness")
        .length;
    const before = harnessReads();

    await userEvent.click(reread());

    await waitFor(() => expect(harnessReads()).toBeGreaterThan(before));
  });

  it("keeps the control's name and marks the facts busy while a re-read runs", async () => {
    let reads = 0;
    const second = held();
    stubServer({
      primitives: () => (++reads === 1 ? skills(2) : second.answer),
    });
    renderPage();

    await screen.findByText("v1.4.0 · 2 skills");
    await userEvent.click(reread());

    expect(reread()).toBeInTheDocument();
    expect(connected()).toHaveAttribute("aria-busy", "true");

    second.resolve(skills(2));
    await waitFor(() => expect(connected()).not.toHaveAttribute("aria-busy"));
  });

  it("announces a re-read even when the count is unchanged", async () => {
    let reads = 0;
    const second = held();
    stubServer({
      primitives: () => (++reads === 1 ? skills(2) : second.answer),
    });
    renderPage();

    await screen.findByText("v1.4.0 · 2 skills");
    await userEvent.click(reread());
    expect(
      await screen.findByText("Loading the Harness location…"),
    ).toBeInTheDocument();

    second.resolve(skills(2));
    expect(
      await screen.findByText("Harness location loaded."),
    ).toBeInTheDocument();
  });

  it("states a failed Inventory read in the approved notice, marked by ✕", async () => {
    stubServer({ primitives: failed });
    renderPage();

    const notice = await screen.findByText("Could not read Inventory");
    const block = notice.closest("[role]");
    expect(block).toHaveTextContent(
      /^✕Could not read InventorySelect Re-read Inventory to try again\.$/,
    );
    expect(block).toHaveClass("border-danger-border", "bg-danger-bg");
    expect(reread()).toBeInTheDocument();
    expect(screen.queryByText(/loading the count/i)).not.toBeInTheDocument();
  });

  it("states a failed re-read after a count was shown, and keeps the facts it had", async () => {
    // design.md → Failures: the previous rows stay after a failed read.
    let reads = 0;
    stubServer({ primitives: () => (++reads === 1 ? skills(2) : failed()) });
    renderPage();

    await screen.findByText("v1.4.0 · 2 skills");
    await userEvent.click(reread());

    expect(
      await screen.findByText("Could not read Inventory"),
    ).toBeInTheDocument();
    expect(await screen.findByText("v1.4.0 · 2 skills")).toBeInTheDocument();
  });

  it("announces a successful retry after a failed read", async () => {
    let reads = 0;
    const retry = held();
    stubServer({
      primitives: () => (++reads === 1 ? failed() : retry.answer),
    });
    renderPage();

    await screen.findByText("Could not read Inventory");
    await userEvent.click(reread());
    expect(
      await screen.findByText("Loading the Harness location…"),
    ).toBeInTheDocument();

    retry.resolve(skills(2));
    expect(
      await screen.findByText("Harness location loaded."),
    ).toBeInTheDocument();
    expect(await screen.findByText("v1.4.0 · 2 skills")).toBeInTheDocument();
    expect(
      screen.queryByText("Could not read Inventory"),
    ).not.toBeInTheDocument();
  });

  it("announces the recovery when a retry succeeds after a failed re-read of a shown count", async () => {
    let reads = 0;
    const retry = held();
    stubServer({
      primitives: () => {
        reads += 1;
        if (reads === 1) return skills(2);
        if (reads === 2) return failed();
        return retry.answer;
      },
    });
    renderPage();

    await screen.findByText("v1.4.0 · 2 skills");
    await userEvent.click(reread());
    await screen.findByText("Could not read Inventory");

    await userEvent.click(reread());
    retry.resolve(skills(5));

    expect(
      await screen.findByText("Harness location loaded."),
    ).toBeInTheDocument();
    expect(await screen.findByText("v1.4.0 · 5 skills")).toBeInTheDocument();
  });

  it("offers Change Harness location in its own section", async () => {
    stubServer();
    renderPage();

    const location = screen.getByRole("region", { name: "Location" });
    expect(
      within(location).getByText(
        "Point Maestro at another local Harness clone.",
      ),
    ).toBeInTheDocument();
    expect(
      within(location).getByRole("button", {
        name: "Change Harness location",
      }),
    ).toBeInTheDocument();
  });
});
