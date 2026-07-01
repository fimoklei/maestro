import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WizardConnectView } from "./wizard-connect-view";

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
          : jsonResponse({ path: "/home/me", entries: [] }, 200);
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
          <Route path="/welcome/connect" element={<WizardConnectView />} />
          <Route path="/" element={<div>deploy-state-landed</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("WizardConnectView", () => {
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

  it("lands on Deploy-state once the user continues past the confirmation", async () => {
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

    expect(await screen.findByText("deploy-state-landed")).toBeInTheDocument();
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

  it("fills the path field from a folder picked via browse", async () => {
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
  });

  it("redirects an already-configured user away instead of showing the connect form", async () => {
    stubApi({ configuredPath: "/home/me/agent-harness" });
    renderView();

    expect(await screen.findByText("deploy-state-landed")).toBeInTheDocument();
    expect(screen.queryByLabelText(/inventory path/i)).not.toBeInTheDocument();
  });
});
