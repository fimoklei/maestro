import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
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

// Routes the fetch stub by URL: the view reads the current config (to show what
// is connected and pre-fill the field) and posts to connect on submit. configPath
// defaults to null — the first-run/not-connected state most tests assume.
function stubApi({
  configPath = null,
  connect,
  browse,
}: {
  configPath?: string | null;
  connect?: () => Response;
  browse?: () => Response;
} = {}) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/inventory/config")) {
        return jsonResponse({ inventoryPath: configPath }, 200);
      }
      if (url.startsWith("/api/filesystem/children")) {
        return browse
          ? browse()
          : jsonResponse({ path: "/home/me", entries: [] }, 200);
      }
      return connect
        ? connect()
        : jsonResponse({ inventoryPath: "/x", primitiveCount: 0 }, 200);
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// Renders the view at /connect with a marker at /inventory so a successful
// connect's navigation is observable without pulling in the real Inventory view.
function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/connect"]}>
        <Routes>
          <Route path="/connect" element={<ConnectView />} />
          <Route path="/inventory" element={<div>inventory-landed</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ConnectView", () => {
  it("offers a labelled path field and a connect action", async () => {
    stubApi();
    renderView();

    expect(await screen.findByLabelText(/inventory path/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /connect/i }),
    ).toBeInTheDocument();
  });

  it("pre-fills the field and shows connected when an inventory is set", async () => {
    stubApi({ configPath: "/home/me/agent-harness" });
    renderView();

    expect(await screen.findByLabelText(/inventory path/i)).toHaveValue(
      "/home/me/agent-harness",
    );
    expect(screen.getByText(/connected/i)).toBeInTheDocument();
  });

  it("connects the pasted path and lands on Inventory", async () => {
    const fetchMock = stubApi({
      connect: () =>
        jsonResponse({ inventoryPath: "/home/me/agent-harness" }, 200),
    });
    renderView();

    await userEvent.type(
      await screen.findByLabelText(/inventory path/i),
      "/home/me/agent-harness",
    );
    await userEvent.click(screen.getByRole("button", { name: /connect/i }));

    expect(await screen.findByText("inventory-landed")).toBeInTheDocument();

    const connectCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).startsWith("/api/inventory/connect"),
    );
    expect(connectCall?.[1]?.method).toBe("POST");
    expect(JSON.parse(connectCall?.[1]?.body as string)).toEqual({
      path: "/home/me/agent-harness",
    });
  });

  it("shows the server's validation message tied to the field", async () => {
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
    await userEvent.click(screen.getByRole("button", { name: /connect/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/no skills\/ folder/i);
    expect(screen.getByLabelText(/inventory path/i)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.queryByText("inventory-landed")).not.toBeInTheDocument();
  });

  it("surfaces an unexpected server error as readable text", async () => {
    stubApi({ connect: () => jsonResponse({ message: "boom" }, 500) });
    renderView();

    await userEvent.type(
      await screen.findByLabelText(/inventory path/i),
      "/home/me/agent-harness",
    );
    await userEvent.click(screen.getByRole("button", { name: /connect/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/boom/i);
  });

  it("fills the path field from a folder picked via browse", async () => {
    // The dialog's own navigation (stepping into a child directory) is covered
    // by browse-dialog.test.tsx; this test only checks the wiring — a selection
    // lands in the field — so the stub answers every browse request with the
    // folder already "browsed into".
    stubApi({
      browse: () =>
        jsonResponse({ path: "/home/me/agent-harness", entries: [] }, 200),
    });
    renderView();

    await userEvent.click(
      await screen.findByRole("button", { name: /browse/i }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /select this folder/i }),
    );

    expect(screen.getByLabelText(/inventory path/i)).toHaveValue(
      "/home/me/agent-harness",
    );
    expect(
      screen.queryByRole("dialog", { name: /browse/i }),
    ).not.toBeInTheDocument();
  });
});
