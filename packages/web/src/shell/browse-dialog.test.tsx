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
import { jsonResponse, renderWithQuery } from "../test-utils";
import { BrowseDialog } from "./browse-dialog";
import { readLastFolder, writeLastFolder } from "./browse-last-folder";
import type { BrowseDialogMode } from "./browse-modes";

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

function renderDialog({
  mode = "connect" as BrowseDialogMode,
  onSelect = vi.fn(),
  onClose = vi.fn(),
  registeredPaths = undefined as ReadonlySet<string> | undefined,
  inventoryPath = undefined as string | undefined,
  outcomes = undefined as readonly RegistrationOutcome[] | undefined,
  isRegistering = undefined as boolean | undefined,
} = {}) {
  renderWithQuery(
    <BrowseDialog
      mode={mode}
      onSelect={onSelect}
      onClose={onClose}
      registeredPaths={registeredPaths}
      inventoryPath={inventoryPath}
      outcomes={outcomes}
      isRegistering={isRegistering}
    />,
  );
  return { onSelect, onClose };
}

const noFacts = { isGitRepo: false, hasApmManifest: false };

const HOME = "/home/me";

type Entry = {
  name: string;
  path: string;
  isHidden?: boolean;
  isSymlink?: boolean;
  facts: typeof noFacts;
};

type Refusal = { error: string; status: number };
type Answer = readonly Entry[] | Refusal;

// The endpoint's listing for one folder under the home ceiling: parent and
// breadcrumbs follow from the path, and home has neither a parent nor a
// segment beyond "~".
function listing(path: string, entries: readonly Entry[]) {
  const segments = path.slice(HOME.length).split("/").filter(Boolean);
  return {
    path,
    ...(segments.length > 0
      ? { parent: path.slice(0, path.lastIndexOf("/")) }
      : {}),
    breadcrumbs: [
      { name: "~", path: HOME },
      ...segments.map((name, index) => ({
        name,
        path: [HOME, ...segments.slice(0, index + 1)].join("/"),
      })),
    ],
    entries,
  };
}

// One stub for the one route the dialog calls, so a test states which folder
// answers with what and nothing else. `paths` names the folders a test steps
// into or refuses; every other request is answered from `at` with `answer`.
function stubFilesystemServer({
  at = HOME,
  answer = [] as Answer,
  paths = {} as Record<string, Answer>,
} = {}) {
  const respond = (given: Answer, path: string) =>
    "error" in given
      ? jsonResponse({ error: given.error }, given.status)
      : jsonResponse(listing(path, given), 200);

  const fetchMock = vi.fn(
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      const { path } = JSON.parse(String(init?.body ?? "{}")) as {
        path?: string;
      };
      if (path !== undefined) {
        const named = paths[path];
        if (named !== undefined) {
          return respond(named, path);
        }
      }
      return respond(answer, at);
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("BrowseDialog", () => {
  it("lists the directory entries returned by the browse endpoint", async () => {
    stubFilesystemServer({
      answer: [
        {
          name: "agent-harness",
          path: "/home/me/agent-harness",
          facts: noFacts,
        },
        { name: "projects", path: "/home/me/projects", facts: noFacts },
      ],
    });
    renderDialog();

    expect(
      await screen.findByRole("button", { name: "agent-harness" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "projects" }),
    ).toBeInTheDocument();
  });

  it("calls onSelect with the directory currently being viewed", async () => {
    stubFilesystemServer();
    const { onSelect } = renderDialog();

    await userEvent.click(
      await screen.findByRole("button", { name: /use this folder/i }),
    );
    expect(onSelect).toHaveBeenCalledWith(["/home/me"]);
  });

  it("navigates into a directory when its entry is clicked", async () => {
    stubFilesystemServer({
      answer: [{ name: "projects", path: "/home/me/projects", facts: noFacts }],
      paths: {
        "/home/me/projects": [
          {
            name: "maestro",
            path: "/home/me/projects/maestro",
            facts: noFacts,
          },
        ],
      },
    });
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
    stubFilesystemServer({
      at: "/home/me/projects",
      paths: {
        "/home/me": [
          { name: "projects", path: "/home/me/projects", facts: noFacts },
        ],
      },
    });
    renderDialog();

    const up = await screen.findByRole("button", { name: /up/i });
    await waitFor(() => expect(up).toBeEnabled());
    await userEvent.click(up);

    expect(
      await screen.findByRole("button", { name: "projects" }),
    ).toBeInTheDocument();
  });

  it("jumps to an ancestor when its breadcrumb segment is clicked", async () => {
    stubFilesystemServer({
      at: "/home/me/dev/repos",
      paths: {
        "/home/me/dev": [
          { name: "repos", path: "/home/me/dev/repos", facts: noFacts },
        ],
      },
    });
    renderDialog();

    await userEvent.click(await screen.findByRole("button", { name: "dev" }));

    expect(
      await screen.findByRole("button", { name: "repos" }),
    ).toBeInTheDocument();
  });

  it("marks the current breadcrumb segment and keeps it unclickable", async () => {
    stubFilesystemServer({ at: "/home/me/dev" });
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
    stubFilesystemServer();
    renderDialog();

    expect(await screen.findByText("Already at home")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /up/i })).toBeDisabled();
  });

  it("confirms a pasted path, bypassing the listing", async () => {
    stubFilesystemServer();
    const { onSelect } = renderDialog();

    const paste = await screen.findByRole("textbox", { name: /paste a path/i });
    await userEvent.type(paste, "/somewhere/else{Enter}");

    expect(onSelect).toHaveBeenCalledWith(["/somewhere/else"]);
  });

  it("confirms the pasted path via the primary button, not the listing folder", async () => {
    // The prominent confirm must honour a non-empty paste field — otherwise a
    // user who pastes then clicks confirm silently gets the listing folder.
    stubFilesystemServer();
    const { onSelect } = renderDialog();

    const paste = await screen.findByRole("textbox", { name: /paste a path/i });
    await userEvent.type(paste, "/somewhere/else");
    await userEvent.click(
      screen.getByRole("button", { name: /use this folder/i }),
    );

    expect(onSelect).toHaveBeenCalledWith(["/somewhere/else"]);
    expect(onSelect).not.toHaveBeenCalledWith(["/home/me"]);
  });

  it("shows the mode title in the header and closes via the close affordance", async () => {
    stubFilesystemServer();
    const { onClose } = renderDialog();

    expect(
      screen.getByRole("heading", { name: "Choose an Inventory folder" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows the register-mode title", async () => {
    stubFilesystemServer();
    renderDialog({ mode: "register" });

    expect(
      await screen.findByRole("heading", { name: "Register repositories" }),
    ).toBeInTheDocument();
  });

  it("badges an already-registered repo in register mode, never git or the inventory badge", async () => {
    stubFilesystemServer({
      answer: [
        {
          name: "acme-web",
          path: "/home/me/acme-web",
          facts: { isGitRepo: true, hasApmManifest: true },
        },
        { name: "notes", path: "/home/me/notes", facts: noFacts },
      ],
    });
    renderDialog({
      mode: "register",
      registeredPaths: new Set(["/home/me/acme-web"]),
    });

    const row = await screen.findByRole("button", { name: "acme-web" });
    // Being a git repo is the norm here; only the refusal ("Not a git repository")
    // is worth a chip.
    expect(row).not.toHaveTextContent("git");
    expect(row).toHaveTextContent("● Registered");
    expect(row).not.toHaveTextContent("◆ Inventory");
    const other = await screen.findByRole("button", { name: "notes" });
    expect(other).not.toHaveTextContent("● Registered");
  });

  it("badges an inventory-looking folder in connect mode, never git or registered badges", async () => {
    stubFilesystemServer({
      answer: [
        {
          name: "agent-harness",
          path: "/home/me/agent-harness",
          facts: { isGitRepo: true, hasApmManifest: true },
        },
      ],
    });
    renderDialog({
      mode: "connect",
      registeredPaths: new Set(["/home/me/agent-harness"]),
    });

    const row = await screen.findByRole("button", { name: "agent-harness" });
    expect(row).toHaveTextContent("◆ Inventory");
    expect(row).not.toHaveTextContent("git");
    expect(row).not.toHaveTextContent("● Registered");
  });

  it("filters hidden entries out of the listing by default and shows a hint", async () => {
    stubFilesystemServer({
      answer: [
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
    });
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

  it("shows hidden entries by default in import-source mode, since skills live in dotfolders", async () => {
    stubFilesystemServer({
      answer: [
        {
          name: ".claude",
          path: "/home/me/.claude",
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
    });
    renderDialog({ mode: "import-source" });

    expect(
      await screen.findByRole("button", { name: ".claude" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /1 hidden item.*shown/i }),
    ).toBeInTheDocument();
  });

  it("omits the hidden-items hint when nothing is hidden", async () => {
    stubFilesystemServer({
      answer: [
        {
          name: "projects",
          path: "/home/me/projects",
          isHidden: false,
          isSymlink: false,
          facts: noFacts,
        },
      ],
    });
    renderDialog();

    await screen.findByRole("button", { name: "projects" });
    expect(
      screen.queryByRole("button", { name: /hidden item/i }),
    ).not.toBeInTheDocument();
  });

  it("reveals hidden entries, dimmed, and offers the same hint to hide them again", async () => {
    stubFilesystemServer({
      answer: [
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
    });
    renderDialog();

    await userEvent.click(
      await screen.findByRole("button", { name: /1 hidden item.*not shown/i }),
    );

    const hiddenRow = await screen.findByRole("button", { name: ".config" });
    expect(hiddenRow).toBeInTheDocument();
    expect(screen.getByText(".config/")).toHaveClass("text-dim");

    // The hint is the only hidden-items control: it now offers the way back.
    await userEvent.click(
      screen.getByRole("button", { name: /1 hidden item.*shown.*hide/i }),
    );
    expect(
      screen.queryByRole("button", { name: ".config" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the hidden-items control out of the toolbar", async () => {
    stubFilesystemServer({
      answer: [
        {
          name: "projects",
          path: "/home/me/projects",
          isHidden: false,
          isSymlink: false,
          facts: noFacts,
        },
      ],
    });
    renderDialog();

    await screen.findByRole("button", { name: "projects" });
    expect(
      screen.queryByRole("button", { name: /hidden/i, pressed: false }),
    ).not.toBeInTheDocument();
  });

  it("shows the symlink tag on a symlinked entry", async () => {
    stubFilesystemServer({
      answer: [
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
    });
    renderDialog();

    const linked = await screen.findByRole("button", { name: "linked-repo" });
    expect(linked).toHaveTextContent("↳ Symlink");
    const plain = await screen.findByRole("button", { name: "plain-repo" });
    expect(plain).not.toHaveTextContent("↳ Symlink");
  });

  it("calls onClose when cancel is activated", async () => {
    stubFilesystemServer();
    const { onClose } = renderDialog();

    await userEvent.click(
      await screen.findByRole("button", { name: /cancel/i }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows a readable error when the directory cannot be browsed", async () => {
    stubFilesystemServer({ answer: { error: "outside-root", status: 403 } });
    renderDialog();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /inside the home folder only/i,
    );
  });

  describe("last-used folder (issue #149)", () => {
    it("opens at the folder remembered for this mode", async () => {
      writeLastFolder("connect", "/home/me/dev");
      const fetchMock = stubFilesystemServer({
        paths: {
          "/home/me/dev": [
            { name: "repos", path: "/home/me/dev/repos", facts: noFacts },
          ],
        },
      });
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
      const fetchMock = stubFilesystemServer();

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
      stubFilesystemServer({
        paths: { "/home/me/gone": { error: "not-found", status: 404 } },
      });
      renderDialog({ mode: "connect" });

      expect(await screen.findByText("Already at home")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("reaches home on the first refusal under production query defaults", async () => {
      // Other tests here disable retries; production's default of three with
      // backoff would stall the fallback and re-send an unchanging refusal.
      // Rendered with a bare QueryClient so that default is under test.
      writeLastFolder("connect", "/elsewhere/repos");
      const fetchMock = stubFilesystemServer({
        paths: { "/elsewhere/repos": { error: "outside-root", status: 403 } },
      });
      // Production defaults on purpose — retries stay on, which is what makes
      // the one-request count below prove the hook's own guard rather than the
      // test client's. Never renderWithQuery here.
      render(
        <QueryClientProvider client={new QueryClient()}>
          <BrowseDialog mode="connect" onSelect={vi.fn()} onClose={vi.fn()} />
        </QueryClientProvider>,
      );

      expect(await screen.findByText("Already at home")).toBeInTheDocument();
      expect(
        fetchMock.mock.calls.filter(
          ([, init]) =>
            JSON.parse(String(init?.body ?? "{}")).path === "/elsewhere/repos",
        ),
      ).toHaveLength(1);
    });

    it("falls back to home when the remembered folder sits outside the browse ceiling", async () => {
      // HOME differs between sessions (worktree to worktree, dev to smoke),
      // so a remembered path can end up beyond the ceiling — same silent
      // fallback as a folder that no longer exists.
      writeLastFolder("connect", "/elsewhere/repos");
      stubFilesystemServer({
        paths: { "/elsewhere/repos": { error: "outside-root", status: 403 } },
      });
      renderDialog({ mode: "connect" });

      expect(await screen.findByText("Already at home")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("shows the error banner when a folder reached by navigating sits outside the browse ceiling", async () => {
      // The fallback is scoped to the initial remembered request. A folder the
      // user clicked into still reports the refusal (story 22 of #145).
      stubFilesystemServer({
        answer: [{ name: "linked", path: "/home/me/linked", facts: noFacts }],
        paths: { "/home/me/linked": { error: "outside-root", status: 403 } },
      });
      renderDialog({ mode: "connect" });

      await userEvent.click(
        await screen.findByRole("button", { name: "linked" }),
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(
        /inside the home folder only/i,
      );
    });

    it("shows the error banner, not a silent fallback, when the remembered folder fails for a reason other than not-found", async () => {
      // "no longer exists" (story 4/5's fallback) is narrower than "any
      // error" — an unreadable folder is a real problem the user should see
      // (story 22), not one silently swapped for home behind their back.
      writeLastFolder("connect", "/home/me/locked");
      const fetchMock = stubFilesystemServer({
        paths: { "/home/me/locked": { error: "unreadable", status: 403 } },
      });
      renderDialog({ mode: "connect" });

      expect(await screen.findByRole("alert")).toHaveTextContent(
        /permissions do not allow reading/i,
      );
      // Flush any pending effects/microtasks so a wrongful fallback (which
      // would fire asynchronously) has had its chance before asserting its
      // absence — avoids a race between this assertion and the effect.
      await act(async () => {});

      expect(screen.getByRole("alert")).toHaveTextContent(
        /permissions do not allow reading/i,
      );
      expect(fetchMock).not.toHaveBeenCalledWith(
        "/api/filesystem/children",
        expect.objectContaining({ body: JSON.stringify({ path: "" }) }),
      );
    });

    it("remembers the folder navigated into, for next time", async () => {
      stubFilesystemServer({
        answer: [
          { name: "projects", path: "/home/me/projects", facts: noFacts },
        ],
        paths: { "/home/me/projects": [] },
      });
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
        facts: { isGitRepo: true, hasApmManifest: false },
      },
      {
        name: "payments-api",
        path: "/home/me/payments-api",
        isHidden: false,
        isSymlink: false,
        facts: { isGitRepo: true, hasApmManifest: false },
      },
      {
        name: "scratch",
        path: "/home/me/scratch",
        isHidden: false,
        isSymlink: false,
        facts: noFacts,
      },
    ];

    const stubRepoListing = () => stubFilesystemServer({ answer: repoEntries });

    it("shows a disabled checkbox and reason for a folder that is not a Git repository", async () => {
      stubRepoListing();
      renderDialog({ mode: "register" });

      expect(
        await screen.findByRole("checkbox", { name: /acme-web/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("checkbox", { name: /payments-api/i }),
      ).toBeInTheDocument();
      expect(screen.getByRole("checkbox", { name: /scratch/i })).toBeDisabled();
      expect(screen.getByText("Not a Git repository")).toBeInTheDocument();
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
      expect(screen.getByText("Current Inventory")).toBeInTheDocument();
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
        screen.getByRole("button", { name: "Register 0 repositories" }),
      ).toBeDisabled();

      await userEvent.click(first);
      await userEvent.click(
        screen.getByRole("checkbox", { name: /payments-api/i }),
      );

      expect(
        screen.getByRole("button", { name: "Register 2 repositories" }),
      ).toBeEnabled();
    });

    it("returns every checked path on confirm, and registers nothing itself", async () => {
      const fetchMock = stubRepoListing();
      const { onSelect } = renderDialog({ mode: "register" });

      await userEvent.click(
        await screen.findByRole("checkbox", { name: /acme-web/i }),
      );
      await userEvent.click(
        screen.getByRole("checkbox", { name: /payments-api/i }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: /Register 2 repositories/ }),
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
      stubFilesystemServer({
        answer: [
          ...repoEntries,
          {
            name: "nested",
            path: "/home/me/nested",
            isHidden: false,
            isSymlink: false,
            facts: noFacts,
          },
        ],
        paths: {
          "/home/me/nested": [
            {
              name: "billing-svc",
              path: "/home/me/nested/billing-svc",
              isHidden: false,
              isSymlink: false,
              facts: { isGitRepo: true, hasApmManifest: false },
            },
          ],
        },
      });
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
        screen.getByRole("button", { name: /Register 2 repositories/ }),
      ).toBeEnabled();

      // …and stepping back leaves the earlier tick in place.
      await userEvent.click(screen.getByRole("button", { name: /up/i }));
      expect(
        await screen.findByRole("checkbox", { name: /acme-web/i }),
      ).toBeChecked();

      await userEvent.click(
        screen.getByRole("button", { name: /Register 2 repositories/ }),
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
        screen.getByRole("button", { name: "Register 0 repositories" }),
      ).toBeDisabled();
    });

    it("counts a pasted path alongside the checked repos", async () => {
      stubRepoListing();
      const { onSelect } = renderDialog({ mode: "register" });

      await userEvent.click(
        await screen.findByRole("checkbox", { name: /acme-web/i }),
      );
      await userEvent.type(
        screen.getByRole("textbox", { name: /paste a path/i }),
        "/elsewhere/repo",
      );

      await userEvent.click(
        screen.getByRole("button", { name: /Register 2 repositories/ }),
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
        screen.getByRole("textbox", { name: /paste a path/i }),
        "/home/me/acme-web",
      );

      await userEvent.click(
        screen.getByRole("button", { name: /Register 1 repository/ }),
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
    const stubEntries = () =>
      stubFilesystemServer({
        answer: [
          {
            name: "agent-harness",
            path: "/home/me/agent-harness",
            facts: noFacts,
          },
          { name: "projects", path: "/home/me/projects", facts: noFacts },
        ],
      });

    it("narrows the current folder's entries as the user types", async () => {
      stubEntries();
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
      stubEntries();
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
      stubFilesystemServer();
      renderDialog({ mode: "register" });

      const register = await screen.findByRole("button", {
        name: /Register 0 repositories/,
      });
      expect(register).toHaveAccessibleDescription(
        /registering changes no files/i,
      );
      expect(register).toHaveAccessibleDescription(
        /files change only when you deploy/i,
      );
      // The deploy's own blast radius is that flow's promise, not this one's.
      expect(register).not.toHaveAccessibleDescription(/apm's bookkeeping/i);
    });

    it("omits the write promise in connect mode, which registers nothing", async () => {
      stubFilesystemServer();
      renderDialog({ mode: "connect" });

      const confirm = await screen.findByRole("button", {
        name: /use this folder/i,
      });
      expect(confirm).not.toHaveAccessibleDescription(/writes nothing/i);
      expect(screen.queryByText(/writes nothing/i)).not.toBeInTheDocument();
    });

    // Picking a clone parent does write — a new folder appears in it — so the
    // promise here is about what stays untouched (#555).
    it("promises in clone-parent mode that nothing already there is disturbed", async () => {
      stubFilesystemServer();
      renderDialog({ mode: "clone-parent" });

      const confirm = await screen.findByRole("button", {
        name: /clone into this folder/i,
      });
      expect(confirm).toHaveAccessibleDescription(
        /named after the repository/i,
      );
      expect(confirm).toHaveAccessibleDescription(/renamed, moved or deleted/i);
      expect(
        screen.getByRole("heading", { name: "Choose a folder for the Harness" }),
      ).toBeInTheDocument();
    });
  });

  // Everything a keyboard user expects from a modal (issue #214): focus lands
  // inside on open and returns to the trigger on close, Escape closes it, and
  // Tab never escapes to the page behind.
  describe("keyboard accessibility (issue #214)", () => {
    // A trigger button that mounts the dialog, so focus-restore-on-close has a
    // real element to return to — the picker's "Browse folders…" button in the app.
    function TriggerHarness({
      isRegistering = false,
    }: {
      isRegistering?: boolean;
    } = {}) {
      const [open, setOpen] = useState(false);
      return (
        <>
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
        </>
      );
    }

    it("moves focus into the dialog when it opens", async () => {
      stubFilesystemServer();
      renderDialog();

      const dialog = await screen.findByRole("dialog");
      await waitFor(() =>
        expect(dialog.contains(document.activeElement)).toBe(true),
      );
      expect(document.activeElement).not.toBe(document.body);
    });

    it("restores focus to the trigger when it closes", async () => {
      stubFilesystemServer();
      renderWithQuery(<TriggerHarness />);

      const trigger = screen.getByRole("button", { name: /browse/i });
      await userEvent.click(trigger);
      await screen.findByRole("dialog");

      await userEvent.keyboard("{Escape}");

      await waitFor(() => expect(trigger).toHaveFocus());
    });

    it("closes on Escape", async () => {
      stubFilesystemServer();
      const { onClose } = renderDialog();

      await screen.findByRole("dialog");
      await userEvent.keyboard("{Escape}");

      expect(onClose).toHaveBeenCalledOnce();
    });

    it("ignores Escape while a registration is in flight", async () => {
      stubFilesystemServer();
      const { onClose } = renderDialog({
        mode: "register",
        isRegistering: true,
      });

      await screen.findByRole("dialog");
      await userEvent.keyboard("{Escape}");

      expect(onClose).not.toHaveBeenCalled();
    });

    it("traps Tab within the dialog", async () => {
      stubFilesystemServer();
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
      stubFilesystemServer();
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
      stubFilesystemServer();
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
      stubFilesystemServer();
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
      stubFilesystemServer();
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
