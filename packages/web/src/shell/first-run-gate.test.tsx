import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { AppRoutes } from "./app-router";

afterEach(() => {
  vi.unstubAllGlobals();
});

// Nothing connected: config answers 200 with inventoryPath null.
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

// Config fails its first call, then recovers: the error + retry path.
function stubServerConfigFailsOnce({
  notConfigured,
}: {
  notConfigured: boolean;
}) {
  let configCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).startsWith("/api/inventory/config")) {
        configCalls += 1;
        return configCalls === 1
          ? jsonResponse({ message: "unreachable" }, 500)
          : jsonResponse(
              {
                inventoryPath: notConfigured ? null : "/home/me/agent-harness",
              },
              200,
            );
      }
      return jsonResponse(
        { ok: true, repos: [], primitives: [], skipped: [], behind: [] },
        200,
      );
    }),
  );
}

function renderAt(path: string) {
  return renderWithQuery(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe("first-run gate", () => {
  it("routes the landing to the connect gate when no inventory is configured", async () => {
    stubServer({ notConfigured: true });
    renderAt("/");

    expect(
      await screen.findByRole("heading", {
        name: /inventory not connected/i,
      }),
    ).toBeInTheDocument();
  });

  it("lands on Deploy-state when an inventory is configured", async () => {
    stubServer({ notConfigured: false });
    renderAt("/");

    expect(
      await screen.findByRole("heading", { name: /deploy-state/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /connect inventory/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps the Harness location page reachable when configured", async () => {
    stubServer({ notConfigured: false });
    renderAt("/settings/harness-location");

    expect(
      await screen.findByRole("heading", { name: /harness location/i }),
    ).toBeInTheDocument();
  });

  it("routes an unconfigured user off Settings into the connect gate", async () => {
    // Settings describes a connected Harness, so an unconfigured visitor
    // belongs in the connect gate, not on an empty page.
    stubServer({ notConfigured: true });
    renderAt("/settings/harness-location");

    expect(
      await screen.findByRole("heading", {
        name: /inventory not connected/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /harness location/i }),
    ).not.toBeInTheDocument();
  });

  it("never shows the connect gate to a configured user, even navigating there directly", async () => {
    stubServer({ notConfigured: false });
    renderAt("/welcome");

    // Checked before config resolves: no Welcome in the pending window.
    expect(
      screen.queryByRole("heading", {
        name: /inventory not connected/i,
      }),
    ).not.toBeInTheDocument();

    expect(
      await screen.findByRole("heading", { name: /deploy-state/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: /inventory not connected/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("shows a readable error with retry on /welcome when the config fetch fails, instead of hanging on Loading", async () => {
    stubServerConfigFailsOnce({ notConfigured: true });
    renderAt("/welcome");

    // A gate that failed to load announces politely, never assertively (#465).
    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent(/Maestro server unreachable/i);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // The dead-end this replaces: it must not sit on the neutral "Loading…".
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /load the screen again/i }),
    ).toBeInTheDocument();
  });

  it("resumes the gate's welcome behavior once a retried config fetch succeeds", async () => {
    stubServerConfigFailsOnce({ notConfigured: true });
    renderAt("/welcome");

    await userEvent.click(
      await screen.findByRole("button", { name: /load the screen again/i }),
    );

    expect(
      await screen.findByRole("heading", {
        name: /inventory not connected/i,
      }),
    ).toBeInTheDocument();
  });
});
