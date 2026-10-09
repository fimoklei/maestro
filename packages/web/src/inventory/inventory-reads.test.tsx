import { focusManager } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppRoutes } from "../shell/app-router";
import { jsonResponse, renderWithQuery } from "../test-utils";

// Every read the Inventory's rows show, as the cockpit requests them.
const ROW_READS = [
  "/api/inventory/primitives",
  "/api/inventory/config",
  "/api/registry",
  "/api/deploy-state/global",
  "/api/deploy-state?repo=",
  "/api/drift/global",
  "/api/drift?repo=",
  "/api/harness/skill/delete/check",
];

// Answers every read at once, and records each request in order.
function stubServer({
  hang = () => false,
}: {
  hang?: (url: string) => boolean;
} = {}) {
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);
      if (hang(url)) return new Promise<Response>(() => undefined);
      if (url.startsWith("/api/inventory/config"))
        return jsonResponse({ inventoryPath: "/h", githubRepository: null });
      if (url.startsWith("/api/inventory/primitives"))
        return jsonResponse({
          primitives: [{ type: "skill", name: "tdd", description: "TDD" }],
        });
      if (url.startsWith("/api/registry"))
        return jsonResponse({ repos: [{ path: "/projects/alpha" }] });
      if (url.startsWith("/api/deploy-state/global"))
        return jsonResponse({ tools: [], skipped: [] });
      if (url.startsWith("/api/deploy-state"))
        return jsonResponse({ primitives: [], skipped: [] });
      if (url.startsWith("/api/drift")) return jsonResponse({ behind: [] });
      if (url.startsWith("/api/harness/skill/delete/check"))
        return jsonResponse({ skills: {} });
      return jsonResponse({ error: "not-configured" }, 409);
    }),
  );
  return requests;
}

const requested = (requests: string[], read: string) =>
  requests.some((url) => url.startsWith(read));

async function renderAt(path: string, requests: string[], reads: string[]) {
  renderWithQuery(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
  await waitFor(() => {
    for (const read of reads) expect(requested(requests, read)).toBe(true);
  });
  requests.length = 0;
}

const returnToTab = () =>
  act(() => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Inventory reads", () => {
  it("re-reads every read its rows show on Re-read Inventory", async () => {
    const requests = stubServer();
    await renderAt("/inventory", requests, ROW_READS);
    await screen.findByText("tdd");

    await userEvent.click(
      screen.getByRole("button", { name: "Re-read Inventory" }),
    );

    await waitFor(() => {
      for (const read of ROW_READS)
        expect([read, requested(requests, read)]).toEqual([read, true]);
    });
  });

  it("stays reading while a Deploy-state read behind its rows runs", async () => {
    let hangDeployState = false;
    const requests = stubServer({
      hang: (url) => hangDeployState && url.startsWith("/api/deploy-state"),
    });
    await renderAt("/inventory", requests, ROW_READS);
    await screen.findByText("tdd");

    hangDeployState = true;
    await userEvent.click(
      screen.getByRole("button", { name: "Re-read Inventory" }),
    );
    await waitFor(() =>
      expect(requested(requests, "/api/inventory/primitives")).toBe(true),
    );
    // Past the skeleton's 0.5 s hold, which a finished read would end.
    await new Promise((resolve) => setTimeout(resolve, 700));

    expect(
      screen.getByRole("grid", { name: "Inventory table" }),
    ).toHaveAttribute("aria-busy", "true");
  });

  it("does not re-read on tab return", async () => {
    const requests = stubServer();
    await renderAt("/inventory", requests, ROW_READS);
    await screen.findByText("tdd");

    returnToTab();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(requests).toEqual([]);
  });

  it("leaves Deploy-state re-reading its rows on tab return", async () => {
    const requests = stubServer();
    await renderAt("/", requests, [
      "/api/deploy-state/global",
      "/api/deploy-state?repo=",
    ]);

    returnToTab();

    await waitFor(() => {
      expect(requested(requests, "/api/deploy-state/global")).toBe(true);
      expect(requested(requests, "/api/deploy-state?repo=")).toBe(true);
    });
  });
});
