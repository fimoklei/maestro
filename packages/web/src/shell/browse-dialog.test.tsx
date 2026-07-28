import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RegistrationOutcome } from "../registry/use-register-repos";
import { BrowseDialog } from "./browse-dialog";
import { readLastFolder, writeLastFolder } from "./browse-last-folder";

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderDialog({
  mode = "connect" as "connect" | "register",
  onSelect = vi.fn(),
  onClose = vi.fn(),
  registeredPaths = undefined as ReadonlySet<string> | undefined,
  inventoryPath = undefined as string | undefined,
  outcomes = undefined as readonly RegistrationOutcome[] | undefined,
  isRegistering = undefined as boolean | undefined,
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <BrowseDialog
        mode={mode}
        onSelect={onSelect}
        onClose={onClose}
        registeredPaths={registeredPaths}
        inventoryPath={inventoryPath}
        outcomes={outcomes}
        isRegistering={isRegistering}
      />
    </QueryClientProvider>,
  );
  return { onSelect, onClose };
}

const noFacts = { isGitRepo: false, hasSkillsSubdir: false };

// The home-ceiling response shape: no parent key, a single "~" breadcrumb.
const homeResponse = {
  path: "/home/me",
  breadcrumbs: [{ name: "~", path: "/home/me" }],
  entries: [] as {
    name: string;
    path: string;
    facts: typeof noFacts;
  }[],
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
              {
                name: "agent-harness",
                path: "/home/me/agent-harness",
                facts: noFacts,
              },
              { name: "projects", path: "/home/me/projects", facts: noFacts },
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
    expect(onSelect).toHaveBeenCalledWith(["/home/me"]);
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
              entries: [
                {
                  name: "maestro",
                  path: "/home/me/projects/maestro",
                  facts: noFacts,
                },
              ],
            },
            200,
          );
        }
        return jsonResponse(
          {
            ...homeResponse,
            entries: [
              { name: "projects", path: "/home/me/projects", facts: noFacts },
            ],
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
              entries: [
                { name: "projects", path: "/home/me/projects", facts: noFacts },
              ],
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
              entries: [
                { name: "repos", path: "/home/me/dev/repos", facts: noFacts },
              ],
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

  it("disables up at the home ceiling and explains it beside the control", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(homeResponse, 200)),
    );
    renderDialog();

    expect(await screen.findByText("already at home")).toBeInTheDocument();
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

    expect(onSelect).toHaveBeenCalledWith(["/somewhere/else"]);
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

    expect(onSelect).toHaveBeenCalledWith(["/somewhere/else"]);
    expect(onSelect).not.toHaveBeenCalledWith(["/home/me"]);
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

  it("shows the register-mode title", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(homeResponse, 200)),
    );
    renderDialog({ mode: "register" });

    expect(
      await screen.findByRole("heading", { name: "Select repos to register" }),
    ).toBeInTheDocument();
  });

  it("badges a git repo and an already-registered repo in register mode, never the inventory badge", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            ...homeResponse,
            entries: [
              {
                name: "acme-web",
                path: "/home/me/acme-web",
                facts: { isGitRepo: true, hasSkillsSubdir: true },
              },
              { name: "notes", path: "/home/me/notes", facts: noFacts },
            ],
          },
          200,
        ),
      ),
    );
    renderDialog({
      mode: "register",
      registeredPaths: new Set(["/home/me/acme-web"]),
    });

    const row = await screen.findByRole("button", { name: "acme-web" });
    expect(row).toHaveTextContent("git");
    expect(row).toHaveTextContent("● registered");
    expect(row).not.toHaveTextContent("◆ inventory");
    const other = await screen.findByRole("button", { name: "notes" });
    expect(other).not.toHaveTextContent("● registered");
  });

  it("badges an inventory-looking folder in connect mode, never git or registered badges", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            ...homeResponse,
            entries: [
              {
                name: "agent-harness",
                path: "/home/me/agent-harness",
                facts: { isGitRepo: true, hasSkillsSubdir: true },
              },
            ],
          },
          200,
        ),
      ),
    );
    renderDialog({
      mode: "connect",
      registeredPaths: new Set(["/home/me/agent-harness"]),
    });

    const row = await screen.findByRole("button", { name: "agent-harness" });
    expect(row).toHaveTextContent("◆ inventory");
    expect(row).not.toHaveTextContent("git");
    expect(row).not.toHaveTextContent("● registered");
  });

  it("filters hidden entries out of the listing by default and shows a hint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            ...homeResponse,
            entries: [
              {
                name: ".config",
                path: "/home/me/.config",
                isHidden: true,
                isSymlink: false,
                facts: noFacts,
              },
              {
                name: "projects",
                path: "/home/me/projects",
                isHidden: false,
                isSymlink: false,
                facts: noFacts,
              },
            ],
          },
          200,
        ),
      ),
    );
    renderDialog();

    expect(
      await screen.findByRole("button", { name: "projects" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: ".config" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /1 hidden item.*not shown/i }),
    ).toBeInTheDocument();
  });

  it("omits the hidden-items hint when nothing is hidden", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            ...homeResponse,
            entries: [
              {
                name: "projects",
                path: "/home/me/projects",
                isHidden: false,
                isSymlink: false,
                facts: noFacts,
              },
            ],
          },
          200,
        ),
      ),
    );
    renderDialog();

    await screen.findByRole("button", { name: "projects" });
    expect(
      screen.queryByRole("button", { name: /hidden item/i }),
    ).not.toBeInTheDocument();
  });

  it("reveals hidden entries, dimmed, when the hidden hint or toolbar toggle is used", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            ...homeResponse,
            entries: [
              {
                name: ".config",
                path: "/home/me/.config",
                isHidden: true,
                isSymlink: false,
                facts: noFacts,
              },
              {
                name: "projects",
                path: "/home/me/projects",
                isHidden: false,
                isSymlink: false,
                facts: noFacts,
              },
            ],
          },
          200,
        ),
      ),
    );
    renderDialog();

    await userEvent.click(
      await screen.findByRole("button", { name: /1 hidden item.*not shown/i }),
    );

    const hiddenRow = await screen.findByRole("button", { name: ".config" });
    expect(hiddenRow).toBeInTheDocument();
    expect(screen.getByText(".config/")).toHaveClass("text-dim");
    // The toggle itself now reflects the revealed state.
    expect(
      screen.getByRole("button", { name: /hidden/i, pressed: true }),
    ).toBeInTheDocument();

    // Flipping the toolbar toggle back off hides it again.
    await userEvent.click(
      screen.getByRole("button", { name: /hidden/i, pressed: true }),
    );
    expect(
      screen.queryByRole("button", { name: ".config" }),
    ).not.toBeInTheDocument();
  });

  it("shows the symlink tag on a symlinked entry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            ...homeResponse,
            entries: [
              {
                name: "linked-repo",
                path: "/home/me/linked-repo",
                isHidden: false,
                isSymlink: true,
                facts: noFacts,
              },
              {
                name: "plain-repo",
                path: "/home/me/plain-repo",
                isHidden: false,
                isSymlink: false,
                facts: noFacts,
              },
            ],
          },
          200,
        ),
      ),
    );
    renderDialog();

    const linked = await screen.findByRole("button", { name: "linked-repo" });
    expect(linked).toHaveTextContent("↳ symlink");
    const plain = await screen.findByRole("button", { name: "plain-repo" });
    expect(plain).not.toHaveTextContent("↳ symlink");
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

  describe("last-used folder (issue #149)", () => {
    it("opens at the folder remembered for this mode", async () => {
      writeLastFolder("connect", "/home/me/dev");
      const fetchMock = vi.fn(
        async (_input: RequestInfo | URL, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body ?? "{}")) as {
            path: string;
          };
          if (body.path === "/home/me/dev") {
            return jsonResponse(
              {
                path: "/home/me/dev",
                parent: "/home/me",
                breadcrumbs: [
                  { name: "~", path: "/home/me" },
                  { name: "dev", path: "/home/me/dev" },
                ],
                entries: [
                  { name: "repos", path: "/home/me/dev/repos", facts: noFacts },
                ],
              },
              200,
            );
          }
          return jsonResponse(homeResponse, 200);
        },
      );
      vi.stubGlobal("fetch", fetchMock);
      renderDialog({ mode: "connect" });

      expect(
        await screen.findByRole("button", { name: "repos" }),
      ).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/filesystem/children",
        expect.objectContaining({
          body: JSON.stringify({ path: "/home/me/dev" }),
        }),
      );
    });

    it("remembers connect and register folders independently", async () => {
      writeLastFolder("connect", "/home/me/connect-folder");
      writeLastFolder("register", "/home/me/register-folder");
      const fetchMock = vi.fn(async () => jsonResponse(homeResponse, 200));
      vi.stubGlobal("fetch", fetchMock);

      renderDialog({ mode: "register" });

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/filesystem/children",
          expect.objectContaining({
            body: JSON.stringify({ path: "/home/me/register-folder" }),
          }),
        ),
      );
      expect(fetchMock).not.toHaveBeenCalledWith(
        "/api/filesystem/children",
        expect.objectContaining({
          body: JSON.stringify({ path: "/home/me/connect-folder" }),
        }),
      );
    });

    it("falls back to home when the remembered folder no longer exists", async () => {
      writeLastFolder("connect", "/home/me/gone");
      const fetchMock = vi.fn(
        async (_input: RequestInfo | URL, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body ?? "{}")) as {
            path: string;
          };
          if (body.path === "/home/me/gone") {
            return jsonResponse(
              { error: "not-found", message: "That folder no longer exists." },
              404,
            );
          }
          return jsonResponse(homeResponse, 200);
        },
      );
      vi.stubGlobal("fetch", fetchMock);
      renderDialog({ mode: "connect" });

      expect(await screen.findByText("already at home")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("falls back to home when the remembered folder sits outside the browse ceiling", async () => {
      // HOME differs between sessions on the same origin (worktree to
      // worktree, dev to smoke), so a remembered path can end up beyond the
      // ceiling. Same silent fallback as a folder that no longer exists —
      // both are "cannot be reached from here", not a problem to report.
      writeLastFolder("connect", "/elsewhere/repos");
      const fetchMock = vi.fn(
        async (_input: RequestInfo | URL, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body ?? "{}")) as {
            path: string;
          };
          if (body.path === "/elsewhere/repos") {
            return jsonResponse(
              {
                error: "outside-root",
                message: "That path is outside the area Maestro can browse.",
              },
              403,
            );
          }
          return jsonResponse(homeResponse, 200);
        },
      );
      vi.stubGlobal("fetch", fetchMock);
      renderDialog({ mode: "connect" });

      expect(await screen.findByText("already at home")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("shows the error banner when a folder reached by navigating sits outside the browse ceiling", async () => {
      // The fallback is scoped to the initial remembered request. A folder the
      // user clicked into still reports the refusal (story 22 of #145).
      const fetchMock = vi.fn(
        async (_input: RequestInfo | URL, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body ?? "{}")) as {
            path: string;
          };
          if (body.path === "/home/me/linked") {
            return jsonResponse(
              {
                error: "outside-root",
                message: "That path is outside the area Maestro can browse.",
              },
              403,
            );
          }
          return jsonResponse(
            {
              ...homeResponse,
              entries: [
                { name: "linked", path: "/home/me/linked", facts: noFacts },
              ],
            },
            200,
          );
        },
      );
      vi.stubGlobal("fetch", fetchMock);
      renderDialog({ mode: "connect" });

      await userEvent.click(
        await screen.findByRole("button", { name: "linked" }),
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(
        /outside the area/i,
      );
    });

    it("shows the error banner, not a silent fallback, when the remembered folder fails for a reason other than not-found", async () => {
      // "no longer exists" (story 4/5's fallback) is narrower than "any
      // error" — an unreadable folder is a real problem the user should see
      // (story 22), not one silently swapped for home behind their back.
      writeLastFolder("connect", "/home/me/locked");
      const fetchMock = vi.fn(
        async (_input: RequestInfo | URL, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body ?? "{}")) as {
            path: string;
          };
          if (body.path === "/home/me/locked") {
            return jsonResponse(
              { error: "unreadable", message: "Permission denied." },
              403,
            );
          }
          return jsonResponse(homeResponse, 200);
        },
      );
      vi.stubGlobal("fetch", fetchMock);
      renderDialog({ mode: "connect" });

      expect(await screen.findByRole("alert")).toHaveTextContent(
        /permission denied/i,
      );
      // Flush any pending effects/microtasks so a wrongful fallback (which
      // would fire asynchronously) has had its chance before asserting its
      // absence — avoids a race between this assertion and the effect.
      await act(async () => {});

      expect(screen.getByRole("alert")).toHaveTextContent(/permission denied/i);
      expect(fetchMock).not.toHaveBeenCalledWith(
        "/api/filesystem/children",
        expect.objectContaining({ body: JSON.stringify({ path: "" }) }),
      );
    });

    it("remembers the folder navigated into, for next time", async () => {
      const fetchMock = vi.fn(
        async (_input: RequestInfo | URL, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body ?? "{}")) as {
            path: string;
          };
          if (body.path === "/home/me/projects") {
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
          }
          return jsonResponse(
            {
              ...homeResponse,
              entries: [
                { name: "projects", path: "/home/me/projects", facts: noFacts },
              ],
            },
            200,
          );
        },
      );
      vi.stubGlobal("fetch", fetchMock);
      renderDialog({ mode: "connect" });

      await userEvent.click(
        await screen.findByRole("button", { name: "projects" }),
      );

      await waitFor(() =>
        expect(readLastFolder("connect")).toBe("/home/me/projects"),
      );
    });
  });

  describe("multi-select registration (issue #151)", () => {
    const repoEntries = [
      {
        name: "acme-web",
        path: "/home/me/acme-web",
        isHidden: false,
        isSymlink: false,
        facts: { isGitRepo: true, hasSkillsSubdir: false },
      },
      {
        name: "payments-api",
        path: "/home/me/payments-api",
        isHidden: false,
        isSymlink: false,
        facts: { isGitRepo: true, hasSkillsSubdir: false },
      },
      {
        name: "scratch",
        path: "/home/me/scratch",
        isHidden: false,
        isSymlink: false,
        facts: noFacts,
      },
    ];

    function stubRepoListing() {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          jsonResponse({ ...homeResponse, entries: repoEntries }, 200),
        ),
      );
    }

    it("shows a disabled checkbox and reason for a folder that is not a git repo", async () => {
      stubRepoListing();
      renderDialog({ mode: "register" });

      expect(
        await screen.findByRole("checkbox", { name: /acme-web/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("checkbox", { name: /payments-api/i }),
      ).toBeInTheDocument();
      expect(screen.getByRole("checkbox", { name: /scratch/i })).toBeDisabled();
      expect(screen.getByText("not a git repo")).toBeInTheDocument();
    });

    it("shows the connected central inventory as unavailable", async () => {
      stubRepoListing();
      renderDialog({
        mode: "register",
        inventoryPath: "/home/me/acme-web",
      });

      expect(
        await screen.findByRole("checkbox", { name: /acme-web/i }),
      ).toBeDisabled();
      expect(screen.getByText("central inventory")).toBeInTheDocument();
    });

    it("never offers checkboxes in connect mode", async () => {
      stubRepoListing();
      renderDialog({ mode: "connect" });

      await screen.findByRole("button", { name: "acme-web" });
      expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    });

    it("disables the checkbox of an already-registered repo", async () => {
      stubRepoListing();
      renderDialog({
        mode: "register",
        registeredPaths: new Set(["/home/me/acme-web"]),
      });

      expect(
        await screen.findByRole("checkbox", { name: /acme-web/i }),
      ).toBeDisabled();
      expect(
        screen.getByRole("checkbox", { name: /payments-api/i }),
      ).toBeEnabled();
    });

    it("counts the checked repos in the confirm, and disables it at zero", async () => {
      stubRepoListing();
      renderDialog({ mode: "register" });

      const first = await screen.findByRole("checkbox", { name: /acme-web/i });
      expect(
        screen.getByRole("button", { name: "register 0 selected →" }),
      ).toBeDisabled();

      await userEvent.click(first);
      await userEvent.click(
        screen.getByRole("checkbox", { name: /payments-api/i }),
      );

      expect(
        screen.getByRole("button", { name: "register 2 selected →" }),
      ).toBeEnabled();
    });

    it("returns every checked path on confirm, and registers nothing itself", async () => {
      const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
        jsonResponse({ ...homeResponse, entries: repoEntries }, 200),
      );
      vi.stubGlobal("fetch", fetchMock);
      const { onSelect } = renderDialog({ mode: "register" });

      await userEvent.click(
        await screen.findByRole("checkbox", { name: /acme-web/i }),
      );
      await userEvent.click(
        screen.getByRole("checkbox", { name: /payments-api/i }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: /register 2 selected/i }),
      );

      expect(onSelect).toHaveBeenCalledWith([
        "/home/me/acme-web",
        "/home/me/payments-api",
      ]);
      // The dialog stays presentational: browsing is the only request it makes.
      expect(
        fetchMock.mock.calls.every(([input]) =>
          String(input).startsWith("/api/filesystem/children"),
        ),
      ).toBe(true);
    });

    it("keeps a repo checked while the user navigates to another folder and back", async () => {
      const nested = {
        path: "/home/me/nested",
        parent: "/home/me",
        breadcrumbs: [
          { name: "~", path: "/home/me" },
          { name: "nested", path: "/home/me/nested" },
        ],
        entries: [
          {
            name: "billing-svc",
            path: "/home/me/nested/billing-svc",
            isHidden: false,
            isSymlink: false,
            facts: { isGitRepo: true, hasSkillsSubdir: false },
          },
        ],
      };
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body ?? "{}")) as {
            path: string;
          };
          if (body.path === "/home/me/nested") {
            return jsonResponse(nested, 200);
          }
          return jsonResponse(
            {
              ...homeResponse,
              entries: [
                ...repoEntries,
                {
                  name: "nested",
                  path: "/home/me/nested",
                  isHidden: false,
                  isSymlink: false,
                  facts: noFacts,
                },
              ],
            },
            200,
          );
        }),
      );
      const { onSelect } = renderDialog({ mode: "register" });

      await userEvent.click(
        await screen.findByRole("checkbox", { name: /acme-web/i }),
      );
      await userEvent.click(screen.getByRole("button", { name: "nested" }));
      await userEvent.click(
        await screen.findByRole("checkbox", { name: /billing-svc/i }),
      );

      // The count covers what was checked in both folders…
      expect(
        screen.getByRole("button", { name: /register 2 selected/i }),
      ).toBeEnabled();

      // …and stepping back leaves the earlier tick in place.
      await userEvent.click(screen.getByRole("button", { name: /up/i }));
      expect(
        await screen.findByRole("checkbox", { name: /acme-web/i }),
      ).toBeChecked();

      await userEvent.click(
        screen.getByRole("button", { name: /register 2 selected/i }),
      );
      expect(onSelect).toHaveBeenCalledWith([
        "/home/me/acme-web",
        "/home/me/nested/billing-svc",
      ]);
    });

    it("unchecks a repo that is clicked twice", async () => {
      stubRepoListing();
      renderDialog({ mode: "register" });

      const checkbox = await screen.findByRole("checkbox", {
        name: /acme-web/i,
      });
      await userEvent.click(checkbox);
      await userEvent.click(checkbox);

      expect(checkbox).not.toBeChecked();
      expect(
        screen.getByRole("button", { name: "register 0 selected →" }),
      ).toBeDisabled();
    });

    it("counts a pasted path alongside the checked repos", async () => {
      stubRepoListing();
      const { onSelect } = renderDialog({ mode: "register" });

      await userEvent.click(
        await screen.findByRole("checkbox", { name: /acme-web/i }),
      );
      await userEvent.type(
        screen.getByRole("textbox", { name: /or paste/i }),
        "/elsewhere/repo",
      );

      await userEvent.click(
        screen.getByRole("button", { name: /register 2 selected/i }),
      );
      expect(onSelect).toHaveBeenCalledWith([
        "/home/me/acme-web",
        "/elsewhere/repo",
      ]);
    });

    it("counts a pasted path that is already ticked only once", async () => {
      stubRepoListing();
      const { onSelect } = renderDialog({ mode: "register" });

      await userEvent.click(
        await screen.findByRole("checkbox", { name: /acme-web/i }),
      );
      await userEvent.type(
        screen.getByRole("textbox", { name: /or paste/i }),
        "/home/me/acme-web",
      );

      await userEvent.click(
        screen.getByRole("button", { name: /register 1 selected/i }),
      );
      expect(onSelect).toHaveBeenCalledWith(["/home/me/acme-web"]);
    });

    it("keeps checking a repo separate from stepping into it", async () => {
      stubRepoListing();
      const { onSelect } = renderDialog({ mode: "register" });

      await userEvent.click(
        await screen.findByRole("checkbox", { name: /acme-web/i }),
      );

      // Ticking must not navigate — the listing is still the same folder.
      expect(
        screen.getByRole("checkbox", { name: /payments-api/i }),
      ).toBeInTheDocument();
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe("filter (issue #149)", () => {
    function entriesResponse() {
      return {
        ...homeResponse,
        entries: [
          {
            name: "agent-harness",
            path: "/home/me/agent-harness",
            facts: noFacts,
          },
          { name: "projects", path: "/home/me/projects", facts: noFacts },
        ],
      };
    }

    it("narrows the current folder's entries as the user types", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse(entriesResponse(), 200)),
      );
      renderDialog();

      await screen.findByRole("button", { name: "agent-harness" });
      const filter = screen.getByRole("textbox", { name: /filter/i });
      await userEvent.type(filter, "proj");

      expect(
        screen.getByRole("button", { name: "projects" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "agent-harness" }),
      ).not.toBeInTheDocument();
    });

    it("restores the full listing when the filter is cleared", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse(entriesResponse(), 200)),
      );
      renderDialog();

      await screen.findByRole("button", { name: "agent-harness" });
      const filter = screen.getByRole("textbox", { name: /filter/i });
      await userEvent.type(filter, "proj");
      await userEvent.clear(filter);

      expect(
        screen.getByRole("button", { name: "agent-harness" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "projects" }),
      ).toBeInTheDocument();
    });
  });

  // The promise is tied to the register button as its accessible description,
  // so "sits at the registration action" is asserted, not just "is somewhere
  // in the dialog" — and a screen reader announces it with the action.
  describe("write promise (issue #218)", () => {
    it("describes the register action with both parts of the write promise", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse(homeResponse, 200)),
      );
      renderDialog({ mode: "register" });

      const register = await screen.findByRole("button", {
        name: /register 0 selected/i,
      });
      expect(register).toHaveAccessibleDescription(
        /registering writes nothing/i,
      );
      expect(register).toHaveAccessibleDescription(
        /only on an explicit deploy/i,
      );
      expect(register).toHaveAccessibleDescription(/apm's bookkeeping/i);
    });

    it("omits the write promise in connect mode, which registers nothing", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse(homeResponse, 200)),
      );
      renderDialog({ mode: "connect" });

      const confirm = await screen.findByRole("button", {
        name: /use this folder/i,
      });
      expect(confirm).not.toHaveAccessibleDescription(/writes nothing/i);
      expect(screen.queryByText(/writes nothing/i)).not.toBeInTheDocument();
    });
  });

  // Everything a keyboard user expects from a modal (issue #214): focus lands
  // inside on open and returns to the trigger on close, Escape closes it, and
  // Tab never escapes to the page behind.
  describe("keyboard accessibility (issue #214)", () => {
    // A trigger button that mounts the dialog, so focus-restore-on-close has a
    // real element to return to — the picker's "browse…" button in the app.
    function TriggerHarness({
      isRegistering = false,
    }: {
      isRegistering?: boolean;
    } = {}) {
      const [open, setOpen] = useState(false);
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      return (
        <QueryClientProvider client={queryClient}>
          <button type="button" onClick={() => setOpen(true)}>
            browse…
          </button>
          {open ? (
            <BrowseDialog
              mode="connect"
              onSelect={vi.fn()}
              onClose={() => setOpen(false)}
              isRegistering={isRegistering}
            />
          ) : null}
        </QueryClientProvider>
      );
    }

    it("moves focus into the dialog when it opens", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse(homeResponse, 200)),
      );
      renderDialog();

      const dialog = await screen.findByRole("dialog");
      await waitFor(() =>
        expect(dialog.contains(document.activeElement)).toBe(true),
      );
      expect(document.activeElement).not.toBe(document.body);
    });

    it("restores focus to the trigger when it closes", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse(homeResponse, 200)),
      );
      render(<TriggerHarness />);

      const trigger = screen.getByRole("button", { name: /browse/i });
      await userEvent.click(trigger);
      await screen.findByRole("dialog");

      await userEvent.keyboard("{Escape}");

      await waitFor(() => expect(trigger).toHaveFocus());
    });

    it("closes on Escape", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse(homeResponse, 200)),
      );
      const { onClose } = renderDialog();

      await screen.findByRole("dialog");
      await userEvent.keyboard("{Escape}");

      expect(onClose).toHaveBeenCalledOnce();
    });

    it("ignores Escape while a registration is in flight", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse(homeResponse, 200)),
      );
      const { onClose } = renderDialog({
        mode: "register",
        isRegistering: true,
      });

      await screen.findByRole("dialog");
      await userEvent.keyboard("{Escape}");

      expect(onClose).not.toHaveBeenCalled();
    });

    it("traps Tab within the dialog", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse(homeResponse, 200)),
      );
      renderDialog();

      const dialog = await screen.findByRole("dialog");
      const focusables = dialog.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), [href], textarea, select",
      );
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) throw new Error("expected focusable controls");

      // Tab off the last control wraps back to the first, never to the page.
      last.focus();
      fireEvent.keyDown(dialog, { key: "Tab" });
      expect(first).toHaveFocus();

      // Shift+Tab off the first wraps to the last.
      first.focus();
      fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
      expect(last).toHaveFocus();
    });

    it("keeps Escape and the Tab trap alive after focus falls back to the page", async () => {
      // Navigating into a folder unmounts the focused row, dropping focus to
      // <body> outside the panel. Escape must still close and Tab must still
      // pull focus back in, never to a control behind the dialog.
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse(homeResponse, 200)),
      );
      const { onClose } = renderDialog();

      const dialog = await screen.findByRole("dialog");
      const first = dialog.querySelector<HTMLElement>(
        "button:not([disabled]), input:not([disabled])",
      );
      if (!first) throw new Error("expected a focusable control");

      // Simulate the focused row unmounting: focus lands on <body>.
      (document.activeElement as HTMLElement | null)?.blur();
      expect(dialog.contains(document.activeElement)).toBe(false);

      // Tab from the page pulls focus back into the dialog.
      fireEvent.keyDown(document.body, { key: "Tab" });
      expect(first).toHaveFocus();

      // Escape still closes, even when it fires from outside the panel.
      (document.activeElement as HTMLElement | null)?.blur();
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(onClose).toHaveBeenCalledOnce();
    });

    it("closes when the backdrop is clicked", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse(homeResponse, 200)),
      );
      const { onClose } = renderDialog();

      const dialog = await screen.findByRole("dialog");
      // The backdrop is a hidden button beside the panel; clicking it closes.
      const backdrop = dialog.parentElement?.querySelector(
        'button[aria-hidden="true"]',
      ) as HTMLElement;
      await userEvent.click(backdrop);

      expect(onClose).toHaveBeenCalledOnce();
    });

    it("keeps the backdrop inert while a registration is in flight", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse(homeResponse, 200)),
      );
      const { onClose } = renderDialog({
        mode: "register",
        isRegistering: true,
      });

      const dialog = await screen.findByRole("dialog");
      const backdrop = dialog.parentElement?.querySelector(
        'button[aria-hidden="true"]',
      ) as HTMLElement;
      await userEvent.click(backdrop);

      expect(onClose).not.toHaveBeenCalled();
    });

    it("puts the modal semantics on the panel, not the overlay", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse(homeResponse, 200)),
      );
      renderDialog();

      const dialog = await screen.findByRole("dialog");
      // The panel carries the semantics and is the focus target (tabindex -1);
      // its parent overlay is a plain, unlabelled backdrop.
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(dialog).toHaveAttribute("aria-label");
      expect(dialog).toHaveAttribute("tabindex", "-1");
      const overlay = dialog.parentElement as HTMLElement;
      expect(overlay).not.toHaveAttribute("role");
      expect(overlay).not.toHaveAttribute("aria-modal");
    });
  });
});
