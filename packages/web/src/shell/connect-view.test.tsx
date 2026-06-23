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
  it("offers a labelled path field and a connect action", () => {
    renderView();

    expect(screen.getByLabelText(/inventory path/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /connect/i }),
    ).toBeInTheDocument();
  });

  it("connects the pasted path and lands on Inventory", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse({ inventoryPath: "/home/me/agent-harness" }, 200),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderView();

    await userEvent.type(
      screen.getByLabelText(/inventory path/i),
      "/home/me/agent-harness",
    );
    await userEvent.click(screen.getByRole("button", { name: /connect/i }));

    expect(await screen.findByText("inventory-landed")).toBeInTheDocument();

    const call = fetchMock.mock.calls[0];
    expect(String(call?.[0])).toBe("/api/inventory/connect");
    expect(call?.[1]?.method).toBe("POST");
    expect(JSON.parse(call?.[1]?.body as string)).toEqual({
      path: "/home/me/agent-harness",
    });
  });

  it("shows the server's validation message tied to the field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            error: "not-an-inventory",
            message:
              "That directory has no skills/ folder, so it is not an inventory.",
          },
          422,
        ),
      ),
    );
    renderView();

    await userEvent.type(
      screen.getByLabelText(/inventory path/i),
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
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ message: "boom" }, 500)),
    );
    renderView();

    await userEvent.type(
      screen.getByLabelText(/inventory path/i),
      "/home/me/agent-harness",
    );
    await userEvent.click(screen.getByRole("button", { name: /connect/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/boom/i);
  });
});
