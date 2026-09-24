import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type FakeRegistry,
  REGISTER,
  renderRepositories,
  statusRegion,
  stubRegistry,
} from "./repositories-test-helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

const threeRepos = (): FakeRegistry => ({
  repos: [
    { path: "/home/me/acme-web", status: "ready" },
    { path: "/home/me/scratch", status: "not-a-git-repo" },
    { path: "/home/me/old-site", status: "folder-missing" },
  ],
});

const rowOf = async (label: string) => {
  const grid = await screen.findByRole("grid", { name: "Repositories table" });
  const cell = await within(grid).findByText(label);
  const row = cell.closest("tr");
  if (row === null) throw new Error(`no row for ${label}`);
  return row;
};

describe("Repositories", () => {
  it("names the screen and puts Register repository in band 1", async () => {
    stubRegistry({ repos: [] });
    renderRepositories();

    expect(
      screen.getByRole("heading", { level: 1, name: "Repositories" }),
    ).toBeInTheDocument();
    expect(
      await screen.findAllByRole("button", { name: REGISTER }),
    ).not.toHaveLength(0);
  });

  it("states an empty registry as its own empty state, with the action repeated", async () => {
    stubRegistry({ repos: [] });
    renderRepositories();

    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "No repositories yet",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The repositories you deploy skills to appear here, with the state of each folder.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: REGISTER })).toHaveLength(2);
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("lists each registration with its label, its path and its own reading", async () => {
    stubRegistry(threeRepos());
    renderRepositories();

    const grid = await screen.findByRole("grid", {
      name: "Repositories table",
    });
    expect(
      within(grid)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Repository", "Folder path", "Status", "Actions"]);

    expect(await rowOf("…/me/acme-web")).toHaveTextContent(
      "…/me/acme-web/home/me/acme-web✓Ready",
    );
    expect(await rowOf("…/me/scratch")).toHaveTextContent(
      "…/me/scratch/home/me/scratch⚠Not a Git repository",
    );
    expect(await rowOf("…/me/old-site")).toHaveTextContent(
      "…/me/old-site/home/me/old-site✕Folder missing",
    );
  });

  it("keeps two repos with one folder name apart by their labels", async () => {
    stubRegistry({
      repos: [
        { path: "/home/me/a/web", status: "ready" },
        { path: "/home/me/b/web", status: "ready" },
      ],
    });
    renderRepositories();

    expect(await rowOf("…/a/web")).toBeInTheDocument();
    expect(await rowOf("…/b/web")).toBeInTheDocument();
  });

  it("puts Unregister alone behind a divider, after View Deploy-state", async () => {
    stubRegistry(threeRepos());
    renderRepositories();

    await userEvent.click(
      within(await rowOf("…/me/old-site")).getByRole("button", {
        name: "Actions for …/me/old-site",
      }),
    );

    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "View Deploy-state",
      "Unregister",
    ]);
    expect(screen.getAllByRole("separator")).toHaveLength(1);
  });

  it("goes to Deploy-state from the row menu", async () => {
    stubRegistry(threeRepos());
    renderRepositories();

    await userEvent.click(
      within(await rowOf("…/me/acme-web")).getByRole("button", {
        name: "Actions for …/me/acme-web",
      }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "View Deploy-state" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Deploy-state screen" }),
    ).toBeInTheDocument();
  });

  async function chooseUnregister(name: string) {
    await userEvent.click(
      within(await rowOf(name)).getByRole("button", {
        name: `Actions for ${name}`,
      }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Unregister" }),
    );
    return screen.findByRole("dialog", { name: `Unregister ${name}` });
  }

  // Unregister is confirmed (design-principles.md → Feedback), with the
  // folder's fate stated before the reader agrees.
  it("asks before unregistering, focus on Cancel, the folder's fate stated", async () => {
    const { calls } = stubRegistry(threeRepos());
    renderRepositories();

    const dialog = await chooseUnregister("…/me/old-site");

    expect(dialog).toHaveTextContent(
      "Maestro stops tracking this folder and no longer shows it on Deploy-state.",
    );
    expect(dialog).toHaveTextContent(
      "The folder stays on disk, and everything deployed in it stays where it is.",
    );
    await waitFor(() =>
      expect(
        within(dialog).getByRole("button", { name: "Cancel" }),
      ).toHaveFocus(),
    );

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(calls("/api/registry/repos", "DELETE")).toEqual([]);
    expect(screen.getByText("/home/me/old-site")).toBeInTheDocument();
  });

  it("unregisters a repo by its listed path, drops its row and says so in a toast", async () => {
    const { calls } = stubRegistry(threeRepos());
    renderRepositories();
    const dialog = await chooseUnregister("…/me/old-site");

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Unregister repository" }),
    );

    expect(
      await screen.findByText("Unregistered …/me/old-site."),
    ).toBeInTheDocument();
    // The toast is the end; the region neither says it twice nor falls back to
    // repeating the earlier read.
    expect(
      screen
        .getAllByRole("status")
        .find((region) => region.classList.contains("sr-only")),
    ).toBeEmptyDOMElement();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(calls("/api/registry/repos", "DELETE")).toEqual([
      { path: "/home/me/old-site" },
    ]);
    await waitFor(() =>
      expect(screen.queryByText("/home/me/old-site")).not.toBeInTheDocument(),
    );
  });

  it("shows Unregistering… in the pressed control and cannot be closed while it runs", async () => {
    let release = () => {};
    stubRegistry({
      ...threeRepos(),
      holdUnregister: new Promise<void>((resolve) => {
        release = resolve;
      }),
    });
    renderRepositories();
    const dialog = await chooseUnregister("…/me/old-site");

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Unregister repository" }),
    );

    expect(
      await within(dialog).findByRole("button", { name: "Unregistering…" }),
    ).toBeInTheDocument();
    expect(statusRegion()).toHaveTextContent("Unregistering…");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(
      within(dialog).getByRole("button", { name: /^Close/ }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    release();
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("states a failed unregister in the dialog that ran it, and the row stays", async () => {
    stubRegistry({
      ...threeRepos(),
      unregisterFails: { status: 404, error: "not-registered" },
    });
    renderRepositories();
    const dialog = await chooseUnregister("…/me/scratch");

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Unregister repository" }),
    );

    expect(
      await within(dialog).findByText("Repository not unregistered"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "It is no longer on the list. Select Re-read Repositories to read the list again.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("/home/me/scratch")).toBeInTheDocument();
    expect(
      screen.queryByText("Unregistered …/me/scratch."),
    ).not.toBeInTheDocument();
  });

  // The read rules (#1037): no retry, so the notice lands on the first
  // failure, and the rows the reader already had stay put.
  it("states a failed re-read after one failed request, rows still on screen", async () => {
    const state = threeRepos();
    const { calls } = stubRegistry(state);
    renderRepositories();
    expect(await rowOf("…/me/acme-web")).toBeInTheDocument();

    state.readFails = 503;
    await userEvent.click(
      screen.getAllByRole("button", {
        name: "Re-read Repositories",
      })[0] as HTMLElement,
    );

    expect(
      await screen.findByText("Registered repositories not read"),
    ).toBeInTheDocument();
    // Past the pressed re-read's skeleton, the rows the reader had return.
    expect(await screen.findByText("/home/me/acme-web")).toBeInTheDocument();
    expect(calls("/api/registry/repos", "GET")).toHaveLength(2);
  });

  it("recovers a failed read with the notice's own Re-read Repositories", async () => {
    const state: FakeRegistry = { ...threeRepos(), readFails: 503 };
    stubRegistry(state);
    renderRepositories();
    await screen.findByText("Registered repositories not read");

    state.readFails = undefined;
    // Two now: band 2's control and the notice's own action.
    const [, noticeAction] = screen.getAllByRole("button", {
      name: "Re-read Repositories",
    });
    await userEvent.click(noticeAction as HTMLElement);

    expect(await rowOf("…/me/acme-web")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByText("Registered repositories not read"),
      ).not.toBeInTheDocument(),
    );
  });

  it("has no path field outside the Register repository dialog", async () => {
    stubRegistry(threeRepos());
    renderRepositories();

    await rowOf("…/me/acme-web");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
