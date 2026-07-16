import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
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

// The home-ceiling response shape: no parent key, a single "~" breadcrumb.
const homeResponse = {
  path: "/home/me",
  breadcrumbs: [{ name: "~", path: "/home/me" }],
  entries: [] as { name: string; path: string }[],
};

describe("BrowseDialog", () => {
  it("lists the directory entries returned by the browse endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            ...homeResponse,
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
      vi.fn(async () => jsonResponse(homeResponse, 200)),
    );
    const { onSelect } = renderDialog();

    await userEvent.click(
      await screen.findByRole("button", { name: /use this folder/i }),
    );
    expect(onSelect).toHaveBeenCalledWith("/home/me");
  });

  it("navigates into a directory when its entry is clicked", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { path: string };
        if (body.path === "/home/me/projects") {
          return jsonResponse(
            {
              path: "/home/me/projects",
              parent: "/home/me",
              breadcrumbs: [
                { name: "~", path: "/home/me" },
                { name: "projects", path: "/home/me/projects" },
              ],
              entries: [{ name: "maestro", path: "/home/me/projects/maestro" }],
            },
            200,
          );
        }
        return jsonResponse(
          {
            ...homeResponse,
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

    expect(
      await screen.findByRole("button", { name: "maestro" }),
    ).toBeInTheDocument();
  });

  it("steps to the server-reported parent when up is clicked", async () => {
    // The dialog lands on a nested folder; up must be usable immediately and
    // ask the server for the reported parent — not retrace a descent history.
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { path: string };
        if (body.path === "/home/me") {
          return jsonResponse(
            {
              ...homeResponse,
              entries: [{ name: "projects", path: "/home/me/projects" }],
            },
            200,
          );
        }
        return jsonResponse(
          {
            path: "/home/me/projects",
            parent: "/home/me",
            breadcrumbs: [
              { name: "~", path: "/home/me" },
              { name: "projects", path: "/home/me/projects" },
            ],
            entries: [],
          },
          200,
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    renderDialog();

    const up = await screen.findByRole("button", { name: /up/i });
    await waitFor(() => expect(up).toBeEnabled());
    await userEvent.click(up);

    expect(
      await screen.findByRole("button", { name: "projects" }),
    ).toBeInTheDocument();
  });

  it("jumps to an ancestor when its breadcrumb segment is clicked", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { path: string };
        if (body.path === "/home/me/dev") {
          return jsonResponse(
            {
              path: "/home/me/dev",
              parent: "/home/me",
              breadcrumbs: [
                { name: "~", path: "/home/me" },
                { name: "dev", path: "/home/me/dev" },
              ],
              entries: [{ name: "repos", path: "/home/me/dev/repos" }],
            },
            200,
          );
        }
        return jsonResponse(
          {
            path: "/home/me/dev/repos",
            parent: "/home/me/dev",
            breadcrumbs: [
              { name: "~", path: "/home/me" },
              { name: "dev", path: "/home/me/dev" },
              { name: "repos", path: "/home/me/dev/repos" },
            ],
            entries: [],
          },
          200,
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    renderDialog();

    await userEvent.click(await screen.findByRole("button", { name: "dev" }));

    expect(
      await screen.findByRole("button", { name: "repos" }),
    ).toBeInTheDocument();
  });

  it("marks the current breadcrumb segment and keeps it unclickable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            path: "/home/me/dev",
            parent: "/home/me",
            breadcrumbs: [
              { name: "~", path: "/home/me" },
              { name: "dev", path: "/home/me/dev" },
            ],
            entries: [],
          },
          200,
        ),
      ),
    );
    renderDialog();

    const current = await screen.findByText("dev");
    expect(current).toHaveAttribute("aria-current", "location");
    expect(
      screen.queryByRole("button", { name: "dev" }),
    ).not.toBeInTheDocument();
    // The ancestor stays clickable.
    expect(screen.getByRole("button", { name: "~" })).toBeInTheDocument();
  });

  it("disables up at the home ceiling and shows the ceiling hint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(homeResponse, 200)),
    );
    renderDialog();

    expect(await screen.findByText(/home ceiling/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /up/i })).toBeDisabled();
  });

  it("confirms a pasted path, bypassing the listing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(homeResponse, 200)),
    );
    const { onSelect } = renderDialog();

    const paste = await screen.findByRole("textbox", { name: /or paste/i });
    await userEvent.type(paste, "/somewhere/else{Enter}");

    expect(onSelect).toHaveBeenCalledWith("/somewhere/else");
  });

  it("confirms the pasted path via the primary button, not the listing folder", async () => {
    // The prominent confirm must honour a non-empty paste field — otherwise a
    // user who pastes then clicks confirm silently gets the listing folder.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(homeResponse, 200)),
    );
    const { onSelect } = renderDialog();

    const paste = await screen.findByRole("textbox", { name: /or paste/i });
    await userEvent.type(paste, "/somewhere/else");
    await userEvent.click(
      screen.getByRole("button", { name: /use this folder/i }),
    );

    expect(onSelect).toHaveBeenCalledWith("/somewhere/else");
    expect(onSelect).not.toHaveBeenCalledWith("/home/me");
  });

  it("shows the mode title in the header and closes via the close affordance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(homeResponse, 200)),
    );
    const { onClose } = renderDialog();

    expect(
      screen.getByRole("heading", { name: "Select inventory folder" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when cancel is activated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(homeResponse, 200)),
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
