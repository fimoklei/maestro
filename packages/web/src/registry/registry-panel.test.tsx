import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RegistryPanel } from "./registry-panel";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Server-state simulated behind fetch: a POST registers, a GET reflects it.
// Proves the panel reads the registry, registers through the mutation, and
// refreshes the list via query invalidation (see .claude/rules/frontend.md).
function stubServer() {
  let repos: { path: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const { path } = JSON.parse(String(init.body)) as { path: string };
        repos = [{ path }];
        return jsonResponse({ repos }, 201);
      }
      return jsonResponse({ repos }, 200);
    }),
  );
}

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RegistryPanel />
    </QueryClientProvider>,
  );
}

describe("RegistryPanel", () => {
  it("registers a repo and shows it in the list after invalidation", async () => {
    stubServer();
    const user = userEvent.setup();
    renderPanel();

    expect(await screen.findByText(/no repos registered/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/repo path/i), "/Users/me/project");
    await user.click(screen.getByRole("button", { name: /register/i }));

    expect(await screen.findByText("/Users/me/project")).toBeInTheDocument();
  });

  it("shows an error instead of the empty state when the registry fails to load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ message: "boom" }, 500)),
    );
    renderPanel();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /could not load/i,
    );
    expect(screen.queryByText(/no repos registered/i)).not.toBeInTheDocument();
  });
});
