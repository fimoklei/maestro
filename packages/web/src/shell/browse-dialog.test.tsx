import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowseDialog } from "./browse-dialog";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderDialog({ onSelect = vi.fn(), onClose = vi.fn() } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <BrowseDialog onSelect={onSelect} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onSelect, onClose };
}

describe("BrowseDialog", () => {
  it("lists the directory entries returned by the browse endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            path: "/home/me",
            entries: [
              { name: "agent-harness", path: "/home/me/agent-harness" },
              { name: "projects", path: "/home/me/projects" },
            ],
          },
          200,
        ),
      ),
    );
    renderDialog();

    expect(
      await screen.findByRole("button", { name: "agent-harness" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "projects" }),
    ).toBeInTheDocument();
  });

  it("calls onSelect with the directory currently being viewed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ path: "/home/me", entries: [] }, 200)),
    );
    const { onSelect } = renderDialog();

    await userEvent.click(
      await screen.findByRole("button", { name: /select this folder/i }),
    );
    expect(onSelect).toHaveBeenCalledWith("/home/me");
  });

  it("navigates into a directory when its entry is clicked", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { path: string };
        if (body.path === "/home/me/projects") {
          return jsonResponse({ path: "/home/me/projects", entries: [] }, 200);
        }
        return jsonResponse(
          {
            path: "/home/me",
            entries: [{ name: "projects", path: "/home/me/projects" }],
          },
          200,
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    renderDialog();

    await userEvent.click(
      await screen.findByRole("button", { name: "projects" }),
    );

    expect(await screen.findByText("/home/me/projects")).toBeInTheDocument();
  });

  it("goes back up to the previous directory", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { path: string };
        if (body.path === "/home/me/projects") {
          return jsonResponse({ path: "/home/me/projects", entries: [] }, 200);
        }
        return jsonResponse(
          {
            path: "/home/me",
            entries: [{ name: "projects", path: "/home/me/projects" }],
          },
          200,
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    renderDialog();

    await userEvent.click(
      await screen.findByRole("button", { name: "projects" }),
    );
    await screen.findByText("/home/me/projects");
    await userEvent.click(screen.getByRole("button", { name: /up/i }));

    expect(await screen.findByText("/home/me")).toBeInTheDocument();
  });

  it("calls onClose when cancel is activated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ path: "/home/me", entries: [] }, 200)),
    );
    const { onClose } = renderDialog();

    await userEvent.click(
      await screen.findByRole("button", { name: /cancel/i }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows a readable error when the directory cannot be browsed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            error: "outside-root",
            message: "That path is outside the area Maestro can browse.",
          },
          403,
        ),
      ),
    );
    renderDialog();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /outside the area/i,
    );
  });
});
