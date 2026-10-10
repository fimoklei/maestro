import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { AppRoutes } from "./app-router";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubEmptyServer() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      jsonResponse(
        { ok: true, repos: [], primitives: [], skipped: [], behind: [] },
        200,
      ),
    ),
  );
}

function renderAt(path: string) {
  return renderWithQuery(
    <MemoryRouter initialEntries={[path]}>
      <Link to="/welcome/connect">Go to connect</Link>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe("AppRoutes", () => {
  it("lands on the Deploy-state view at the root route", async () => {
    stubEmptyServer();
    renderAt("/");

    expect(
      await screen.findByRole("heading", { name: /deploy-state/i }),
    ).toBeInTheDocument();
  });

  it.each([
    ["/", "Deploy-state · Maestro"],
    ["/inventory", "Inventory · Maestro"],
    ["/inventory/", "Inventory · Maestro"],
    ["/repositories", "Repositories · Maestro"],
    ["/harness", "Harness · Maestro"],
    ["/settings/harness-location", "Harness location · Settings · Maestro"],
    ["/settings/appearance", "Appearance · Settings · Maestro"],
    ["/welcome", "No Harness connected · Maestro"],
    ["/welcome/connect", "Connect a Harness · Maestro"],
  ])("titles the document of %s as %s", async (path, title) => {
    stubEmptyServer();
    document.title = "Maestro";
    renderAt(path);

    await waitFor(() => expect(document.title).toBe(title));
  });

  it("retitles the document when the reader moves to another screen", async () => {
    stubEmptyServer();
    renderAt("/welcome");
    await waitFor(() =>
      expect(document.title).toBe("No Harness connected · Maestro"),
    );

    await userEvent.click(screen.getByRole("link", { name: "Go to connect" }));

    await waitFor(() =>
      expect(document.title).toBe("Connect a Harness · Maestro"),
    );
  });
});
