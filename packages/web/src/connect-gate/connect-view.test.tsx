import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectView } from "./connect-view";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubApi({
  connect,
  browse,
  configuredPath = null,
}: {
  connect?: () => Response;
  browse?: () => Response;
  configuredPath?: string | null;
} = {}) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/inventory/config")) {
        return jsonResponse({ inventoryPath: configuredPath }, 200);
      }
      if (url.startsWith("/api/filesystem/children")) {
        return browse
          ? browse()
          : jsonResponse(
              {
                path: "/home/me",
                breadcrumbs: [{ name: "~", path: "/home/me" }],
                entries: [],
              },
              200,
            );
      }
      return connect
        ? connect()
        : jsonResponse(
            { inventoryPath: "/home/me/agent-harness", primitiveCount: 7 },
            200,
          );
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/welcome/connect"]}>
        <Routes>
          <Route path="/welcome/connect" element={<ConnectView />} />
          <Route path="/inventory" element={<div>inventory-landed</div>} />
          <Route path="/" element={<div>deploy-state-landed</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ConnectView", () => {
  it("opens the document outline with a real h1", async () => {
    stubApi();
    renderView();

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: /connect central inventory/i,
      }),
    ).toBeInTheDocument();
  });

  it("shows the confirmation with the primitive count after a successful connect", async () => {
    stubApi();
    renderView();

    await userEvent.type(
      await screen.findByLabelText(/inventory path/i),
      "/home/me/agent-harness",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /^connect inventory$/i }),
    );

    expect(await screen.findByText(/7 primitives found/i)).toBeInTheDocument();
    expect(
      screen.getByText(/read-only, never writes back/i),
    ).toBeInTheDocument();
  });

  it("names the connected source on the confirmation, beyond its basename", async () => {
    // The surface that confirms the connection must identify the source itself
    // (#211): the shortened path tail is visible, and the whole path stays
    // reachable on hover, without navigating to the source view.
    stubApi();
    renderView();

    await userEvent.type(
      await screen.findByLabelText(/inventory path/i),
      "/home/me/agent-harness",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /^connect inventory$/i }),
    );

    const source = await screen.findByText("…/me/agent-harness");
    expect(source).toHaveAttribute("title", "/home/me/agent-harness");
  });

  it("lands on Inventory once the user continues past the confirmation", async () => {
    stubApi();
    renderView();

    await userEvent.type(
      await screen.findByLabelText(/inventory path/i),
      "/home/me/agent-harness",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /^connect inventory$/i }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /continue/i }),
    );

    expect(await screen.findByText("inventory-landed")).toBeInTheDocument();
  });

  it("shows a readable error for an invalid path and stays on the step", async () => {
    stubApi({
      connect: () =>
        jsonResponse(
          {
            error: "not-an-inventory",
            message:
              "That directory has no skills/ folder, so it is not an inventory.",
          },
          422,
        ),
    });
    renderView();

    await userEvent.type(
      await screen.findByLabelText(/inventory path/i),
      "/home/me/not-a-clone",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /^connect inventory$/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no skills\/ folder/i,
    );
    expect(screen.queryByText("deploy-state-landed")).not.toBeInTheDocument();
  });

  it("shows the no-usable-origin card and reopens browse from its call to action", async () => {
    stubApi({
      connect: () =>
        jsonResponse(
          {
            error: "no-usable-origin",
            message:
              "That folder has skills/, but its git origin is missing, unreadable, or in a form apm cannot resolve.",
          },
          422,
        ),
    });
    renderView();

    await userEvent.type(
      await screen.findByLabelText(/inventory path/i),
      "/home/me/skills-only-folder",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /^connect inventory$/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no usable git origin/i,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /browse again/i }),
    );
    expect(
      await screen.findByRole("button", { name: /use this folder/i }),
    ).toBeInTheDocument();
  });

  it("fills the path field from a folder picked via browse", async () => {
    stubApi({
      browse: () =>
        jsonResponse(
          {
            path: "/home/me/agent-harness",
            parent: "/home/me",
            breadcrumbs: [
              { name: "~", path: "/home/me" },
              { name: "agent-harness", path: "/home/me/agent-harness" },
            ],
            entries: [],
          },
          200,
        ),
    });
    renderView();

    await userEvent.click(
      await screen.findByRole("button", { name: /browse/i }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /use this folder/i }),
    );

    expect(screen.getByLabelText(/inventory path/i)).toHaveValue(
      "/home/me/agent-harness",
    );
  });

  it("redirects an already-configured user away instead of showing the connect form", async () => {
    stubApi({ configuredPath: "/home/me/agent-harness" });
    renderView();

    // Checked synchronously, before the config fetch has had a chance to
    // resolve: the form must not render even for the brief pending window
    // while the cockpit doesn't yet know whether this user is configured
    // (Codex review finding — a flash of the first-run form before the
    // redirect effect fires would still violate "the connect gate never shows").
    expect(screen.queryByLabelText(/inventory path/i)).not.toBeInTheDocument();

    expect(await screen.findByText("deploy-state-landed")).toBeInTheDocument();
    expect(screen.queryByLabelText(/inventory path/i)).not.toBeInTheDocument();
  });
});
