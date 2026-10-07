import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { measureAs, sentence } from "../test-utils";
import {
  cellsOf,
  findRow,
  grid,
  RECENT,
  renderDeployState,
  rowOf,
  stubServer,
} from "./deploy-state-test-helpers";

// The Deploy-state table. The pane is in deploy-state-view-pane.test.tsx.

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const skill = (name: string, version = "v0.5.0") => ({
  type: "skill",
  name,
  version,
});

const head = (release: string, latestRelease: string, changed = 1) => ({
  release,
  latestRelease,
  changed,
  changedSkills: changed === 0 ? [] : ["tdd"],
  selection: ["tdd"],
  selected: 5,
  comparedAt: RECENT(),
});

const TWO_TOOLS = {
  tools: [
    { tool: "claude", primitives: [skill("tdd")] },
    { tool: "codex", primitives: [] },
  ],
  skipped: [],
};

describe("Deploy-state — one table of every target", () => {
  it("lists every target under the Global and Repositories group headers", async () => {
    stubServer(() => ({
      repos: ["/Users/me/a", "/Users/me/b"],
      global: TWO_TOOLS,
    }));
    renderDeployState();

    await findRow("…/me/b");
    for (const header of ["Target", "Release", "Status", "Skills"]) {
      expect(
        within(grid()).getByRole("columnheader", { name: new RegExp(header) }),
      ).toBeInTheDocument();
    }
    const cells = within(grid())
      .getAllByRole("gridcell")
      .map((cell) => cell.textContent);
    expect(cells).toContain("Global 2");
    expect(cells).toContain("Repositories 2");
    // #1180: the name only; the path is the pane's Path fact.
    expect(cellsOf("Claude Code")[0]).toBe("Claude Code");
    expect(cellsOf("Codex")[0]).toBe("Codex");
  });

  it("keeps two repositories that share a prefix apart", async () => {
    stubServer(() => ({
      repos: [
        "/Users/me/clientA/repos/agent-harness",
        "/Users/me/clientB/repos/agent-harness",
      ],
    }));
    renderDeployState();

    expect(
      await screen.findByText("…/clientA/repos/agent-harness"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("…/clientB/repos/agent-harness"),
    ).toBeInTheDocument();
  });

  it("reveals a shortened target name through the tooltip, not a native title", async () => {
    measureAs(300, 100);
    stubServer(() => ({ repos: ["/Users/me/clientA/repos/agent-harness"] }));
    renderDeployState();

    const name = await screen.findByText("…/repos/agent-harness");
    await userEvent.hover(name);

    expect(
      await screen.findByRole("tooltip", { hidden: true }),
    ).toHaveTextContent("…/repos/agent-harness");
    expect(name).not.toHaveAttribute("title");
  });

  it("counts the targets once both reads have landed", async () => {
    stubServer(() => ({
      repos: ["/Users/me/a", "/Users/me/b"],
      global: TWO_TOOLS,
    }));
    renderDeployState();

    expect(await screen.findByText("4 targets")).toBeInTheDocument();
  });

  it("does not count targets before both reads have landed", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderDeployState();

    expect(screen.queryByText(/\d+ targets?/)).toBeNull();
    expect(
      screen.queryByText(/no repositories registered\./i),
    ).not.toBeInTheDocument();
  });

  it("states plainly that nothing is deployed on a cold start", async () => {
    stubServer(() => ({ repos: [], global: { tools: [], skipped: [] } }));
    renderDeployState();

    expect(await screen.findByText("Nothing deployed yet")).toBeInTheDocument();
    // Each empty group still says what fills it.
    expect(
      within(grid()).getByText(
        "Install Claude Code or Codex to deploy skills globally.",
      ),
    ).toBeInTheDocument();
    expect(
      within(grid()).getByText(
        "No repositories registered yet. Select Register repository on the Repositories screen.",
      ),
    ).toBeInTheDocument();
  });

  it("titles the screen with one h1", async () => {
    stubServer(() => ({}));
    renderDeployState();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Deploy-state" }),
    ).toBeInTheDocument();
  });

  it("names where repositories come from in the empty Repositories group, as information only", async () => {
    stubServer(() => ({ repos: [], global: TWO_TOOLS }));
    renderDeployState();

    await findRow("Codex");
    const hint = within(grid()).getByText(
      "No repositories registered yet. Select Register repository on the Repositories screen.",
    );
    expect(within(hint).queryByRole("button")).not.toBeInTheDocument();
    expect(within(hint).queryByRole("link")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Register repository" }),
    ).not.toBeInTheDocument();
  });

  it("drops that hint once a repository is registered", async () => {
    stubServer(() => ({ repos: ["/Users/me/a"] }));
    renderDeployState();

    expect(await findRow("…/me/a")).toBeInTheDocument();
    expect(
      screen.queryByText(/no repositories registered yet\./i),
    ).not.toBeInTheDocument();
  });
});

describe("Deploy-state — Release, Status and Skills", () => {
  it("states the release, or the pair when a newer one exists", async () => {
    stubServer(() => ({
      repos: ["/Users/me/a", "/Users/me/b"],
      repo: {
        "/Users/me/a": {
          primitives: [skill("tdd", "v0.3.2")],
          skipped: [],
          releaseHead: head("v0.3.2", "v0.3.4"),
        },
        "/Users/me/b": {
          primitives: [skill("tdd", "v0.3.4")],
          skipped: [],
          releaseHead: head("v0.3.4", "v0.3.4", 0),
        },
      },
    }));
    renderDeployState();

    await findRow("…/me/b");
    await waitFor(() =>
      expect(cellsOf("…/me/a").slice(1)).toEqual([
        "v0.3.2 → v0.3.4",
        "Behind",
        "1",
      ]),
    );
    expect(cellsOf("…/me/b").slice(1)).toEqual(["v0.3.4", "In sync", "1"]);
    // The arrow is drawn; a screen reader hears the word.
    const release = within(rowOf("…/me/a")).getAllByRole(
      "gridcell",
    )[1] as HTMLElement;
    expect(within(release).getByText("→")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(within(release).getByText("to")).toHaveClass("sr-only");
  });

  it("reads an empty target as Empty, with a dash for its release and skills", async () => {
    stubServer(() => ({
      global: { tools: [{ tool: "codex", primitives: [] }], skipped: [] },
    }));
    renderDeployState();

    await findRow("Codex");
    await waitFor(() =>
      expect(cellsOf("Codex").slice(1)).toEqual(["—", "Empty", "—"]),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("never reads a target holding only an unsupported entry as empty", async () => {
    stubServer(() => ({
      repos: ["/Users/me/project"],
      repo: {
        "/Users/me/project": {
          primitives: [],
          skipped: [
            {
              reason: "unsupported-type",
              virtualPath: "hooks/format",
              packageType: "claude_hook",
            },
          ],
        },
      },
    }));
    renderDeployState();

    await findRow("…/me/project");
    await waitFor(() => expect(cellsOf("…/me/project")[2]).toBe("In sync"));
    expect(screen.queryByText("Empty")).not.toBeInTheDocument();
  });

  it("reads a target holding an invalid record as Attention, never In sync", async () => {
    stubServer(() => ({
      repos: ["/Users/me/project"],
      repo: {
        "/Users/me/project": {
          primitives: [],
          skipped: [
            {
              reason: "invalid-package",
              virtualPath: "skills/tdd",
              packageType: "invalid",
            },
          ],
        },
      },
    }));
    renderDeployState();

    await findRow("…/me/project");
    await waitFor(() => expect(cellsOf("…/me/project")[2]).toBe("Attention"));
  });

  it("reads every global tool as Attention while a global record needs it", async () => {
    stubServer(() => ({
      global: {
        tools: [{ tool: "claude", primitives: [] }],
        skipped: [
          {
            reason: "invalid-package",
            virtualPath: "skills/tdd",
            packageType: "invalid",
          },
        ],
      },
    }));
    renderDeployState();

    await findRow("Claude Code");
    await waitFor(() => expect(cellsOf("Claude Code")[2]).toBe("Attention"));
  });

  it("reads a target with a no-longer-released skill as Attention", async () => {
    stubServer(() => ({
      global: {
        tools: [{ tool: "claude", primitives: [skill("tdd")] }],
        skipped: [],
      },
      drift: {
        global: {
          behind: [
            {
              name: "tdd",
              current: "v0.5.0",
              latest: "v0.5.1",
              reading: "no-longer-released",
            },
          ],
        },
      },
    }));
    renderDeployState();

    await findRow("Claude Code");
    await waitFor(() => expect(cellsOf("Claude Code")[2]).toBe("Attention"));
  });

  it("names another origin instead of calling a target empty (#655)", async () => {
    stubServer(() => ({
      global: {
        tools: [{ tool: "claude", primitives: [] }],
        skipped: [],
        otherOrigins: ["fimoklei/agent-harness"],
      },
    }));
    renderDeployState();

    await findRow("Claude Code");
    await waitFor(() => expect(cellsOf("Claude Code")[2]).toBe("Other origin"));
  });

  it("reads a target pinned per skill as a fact, with the release most skills sit on", async () => {
    stubServer(() => ({
      repos: ["/Users/me/project"],
      repo: {
        "/Users/me/project": {
          primitives: [skill("tdd", "v0.3.1"), skill("jobs", "v0.3.0")],
          skipped: [],
          pinnedPerSkill: [
            { release: "v0.3.1", skills: 1 },
            { release: "v0.3.0", skills: 1 },
          ],
        },
      },
    }));
    renderDeployState();

    await findRow("…/me/project");
    await waitFor(() =>
      expect(cellsOf("…/me/project").slice(1)).toEqual([
        "v0.3.1",
        "Pinned per skill",
        "2",
      ]),
    );
  });

  it("maps the global drift onto the tool where the skill is deployed only", async () => {
    stubServer(() => ({
      global: TWO_TOOLS,
      drift: {
        global: {
          behind: [
            {
              name: "tdd",
              current: "v0.5.0",
              latest: "v0.5.1",
              reading: "behind",
            },
          ],
        },
      },
    }));
    renderDeployState();

    await findRow("Codex");
    await waitFor(() => expect(cellsOf("Claude Code")[2]).toBe("Behind"));
    expect(cellsOf("Codex")[2]).toBe("Empty");
  });

  it("does not read Behind when the only behind skill is not deployed here", async () => {
    stubServer(() => ({
      repos: ["/Users/me/project"],
      repo: {
        "/Users/me/project": { primitives: [skill("tdd")], skipped: [] },
      },
      drift: {
        "/Users/me/project": {
          behind: [
            {
              name: "foo",
              current: "v1.0.0",
              latest: "v1.1.0",
              reading: "behind",
            },
          ],
        },
      },
    }));
    renderDeployState();

    await findRow("…/me/project");
    await waitFor(() => expect(cellsOf("…/me/project")[2]).toBe("In sync"));
  });

  it("reads a check that could not run as Unknown, never In sync", async () => {
    stubServer(() => ({
      repos: ["/Users/me/project"],
      repo: {
        "/Users/me/project": { primitives: [skill("tdd")], skipped: [] },
      },
      drift: { "/Users/me/project": { ok: false } },
    }));
    renderDeployState();

    await findRow("…/me/project");
    await waitFor(() => expect(cellsOf("…/me/project")[2]).toBe("Unknown"));
  });

  it("claims no reading for a repository whose deploy-state was not read", async () => {
    stubServer(() => ({
      repos: ["/Users/me/project"],
      repo: { "/Users/me/project": { status: 500, body: { message: "boom" } } },
      drift: {
        "/Users/me/project": {
          behind: [
            {
              name: "tdd",
              current: "v0.5.0",
              latest: "v0.5.1",
              reading: "behind",
            },
          ],
        },
      },
    }));
    renderDeployState();

    await findRow("…/me/project");
    await waitFor(() => expect(cellsOf("…/me/project")[2]).toBe("Unknown"));
  });

  it("holds one reason and the read age in the status hover card", async () => {
    stubServer(() => ({
      repos: ["/Users/me/a"],
      repo: {
        "/Users/me/a": {
          primitives: [skill("tdd", "v0.3.2")],
          skipped: [],
          releaseHead: { ...head("v0.3.2", "v0.3.4", 2), selected: 5 },
        },
      },
    }));
    renderDeployState();

    await findRow("…/me/a");
    await userEvent.hover(await within(rowOf("…/me/a")).findByText("Behind"));

    const reason = await screen.findByText(
      sentence(
        "2 of 5 deployed skills changed in v0.3.4. Select Update target to move this target to v0.3.4.",
      ),
    );
    const card = reason.parentElement as HTMLElement;
    expect(
      Array.from(card.querySelectorAll("p"), (line) => line.textContent),
    ).toEqual([
      "2 of 5 deployed skills changed in v0.3.4. Select Update target to move this target to v0.3.4.",
      "Read just now",
    ]);
  });
});

describe("Deploy-state — failed reads", () => {
  it("states a failed global read at the top, with its re-read, never as no tools", async () => {
    stubServer(() => ({
      global: { status: 422, body: { error: "malformed" } },
    }));
    renderDeployState();

    const notice = await screen.findByText("Deploy-state not read");
    expect(notice.closest("[role=status]")).toHaveTextContent(
      "Select Re-read Deploy-state to read every target again.Not read: global targets.",
    );
    expect(
      screen.queryByText(/install claude code or codex/i),
    ).not.toBeInTheDocument();
  });

  it("states a failed registry read, never the register hint", async () => {
    stubServer(() => ({ repos: { status: 500, body: { message: "boom" } } }));
    renderDeployState();

    expect(
      await screen.findByText("Not read: registered repositories."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/no repositories registered yet\./i),
    ).not.toBeInTheDocument();
  });

  // #1393: the failures share Re-read Deploy-state, so the band shows one.
  it("merges several failed reads into one notice that names each part", async () => {
    stubServer(() => ({
      repos: { status: 500, body: { message: "boom" } },
      global: { status: 422, body: { error: "malformed" } },
    }));
    renderDeployState();

    expect(
      await screen.findByText(
        "Not read: global targets and registered repositories.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Deploy-state not read")).toHaveLength(1);
    expect(
      screen.getAllByRole("button", { name: "Re-read Deploy-state" }),
    ).toHaveLength(2);
  });

  it("states a missing tool in the Global group, never in the band", async () => {
    stubServer(() => ({ repos: ["/Users/me/a"] }));
    renderDeployState();

    await findRow("…/me/a");
    expect(
      within(grid()).getByText(
        "Install Claude Code or Codex to deploy skills globally.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No supported tool detected"),
    ).not.toBeInTheDocument();
  });

  it("shows an install hint when no supported tool is detected, skipped entries still named", async () => {
    stubServer(() => ({
      global: {
        tools: [],
        skipped: [
          {
            reason: "unsupported-type",
            virtualPath: "hooks/pre-commit",
            packageType: "claude_hook",
          },
        ],
      },
    }));
    renderDeployState();

    await screen.findByText(/install claude code or codex/i);
    // With no tool row to open, the Global group's line names them.
    expect(
      within(grid()).getByText(sentence(/hooks\/pre-commit is deployed as/i)),
    ).toBeInTheDocument();
  });
});

describe("Deploy-state — Re-read and freshness", () => {
  it("keeps the rows on screen while the slow Behind check still runs", async () => {
    stubServer(() => ({
      global: TWO_TOOLS,
      drift: { global: new Promise(() => {}) },
    }));
    renderDeployState();
    await findRow("Codex");

    // Past the 1.3 s after which a running read draws skeleton rows.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(rowOf("Codex")).toBeInTheDocument();
    expect(grid()).not.toHaveAttribute("aria-busy");
  });

  it("marks a status still being read as busy, with a placeholder past 1.3 s", async () => {
    stubServer(() => ({
      global: TWO_TOOLS,
      drift: { global: new Promise(() => {}) },
    }));
    renderDeployState();
    await findRow("Claude Code");
    const status = within(rowOf("Claude Code")).getAllByRole(
      "gridcell",
    )[3] as HTMLElement;

    expect(status.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(
      status.querySelector(".animate-pulse, [class*='animate-pulse']"),
    ).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(status.querySelector("[class*='animate-pulse']")).not.toBeNull();
  });

  it("re-reads every target and bypasses the 5-minute Behind cache", async () => {
    const fetchMock = stubServer(() => ({
      repos: ["/Users/me/a"],
      global: TWO_TOOLS,
    }));
    renderDeployState();
    await findRow("…/me/a");
    await waitFor(() => expect(cellsOf("…/me/a")[2]).toBe("Empty"));
    const driftReads = () =>
      fetchMock.mock.calls.filter(([url]) =>
        String(url).startsWith("/api/drift"),
      ).length;
    const before = driftReads();

    await userEvent.click(
      screen.getByRole("button", { name: "Re-read Deploy-state" }),
    );

    await waitFor(() => expect(driftReads()).toBe(before + 2));
  });

  it("dates the oldest reading in band 2", async () => {
    stubServer(() => ({ global: TWO_TOOLS }));
    renderDeployState();

    expect(await screen.findByText("Read just now")).toBeInTheDocument();
  });

  it("ticks band 2 and the status hover card while the screen stays open", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const fetchMock = stubServer(() => ({
        repos: ["/Users/me/a"],
        repo: {
          "/Users/me/a": {
            primitives: [skill("tdd", "v0.3.2")],
            skipped: [],
            releaseHead: { ...head("v0.3.2", "v0.3.4", 2), selected: 5 },
          },
        },
      }));
      renderDeployState();
      await findRow("…/me/a");
      expect(await screen.findByText("Read just now")).toBeInTheDocument();
      await userEvent.hover(await within(rowOf("…/me/a")).findByText("Behind"));
      const card = (
        await screen.findByText(
          sentence(
            "2 of 5 deployed skills changed in v0.3.4. Select Update target to move this target to v0.3.4.",
          ),
        )
      ).parentElement as HTMLElement;
      expect(within(card).getByText("Read just now")).toBeInTheDocument();
      const reads = fetchMock.mock.calls.length;

      await act(() => vi.advanceTimersByTimeAsync(2 * 60_000));

      // Band 2 and the card, each once.
      expect(screen.getAllByText("Read 2 min ago")).toHaveLength(2);
      expect(within(card).getByText("Read 2 min ago")).toBeInTheDocument();
      expect(fetchMock.mock.calls.length).toBe(reads);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Deploy-state — rows and their menu", () => {
  it("opens the pane of the target another screen asked for", async () => {
    stubServer(() => ({ global: TWO_TOOLS }));
    renderDeployState({ openTarget: "global:codex" });

    expect(
      await screen.findByRole("complementary", { name: "Codex detail" }),
    ).toBeInTheDocument();
  });

  it("opens the pane of a repository another screen asked for", async () => {
    stubServer(() => ({
      repos: ["/Users/me/a", "/Users/me/b"],
      global: TWO_TOOLS,
    }));
    renderDeployState({ openTarget: "repo:/Users/me/b" });

    expect(
      await screen.findByRole("complementary", { name: "…/me/b detail" }),
    ).toBeInTheDocument();
  });

  it("opens no pane and states nothing for a repository it does not list", async () => {
    stubServer(() => ({ repos: ["/Users/me/a"], global: TWO_TOOLS }));
    renderDeployState({ openTarget: "repo:/Users/me/gone" });

    await findRow("…/me/a");
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("opens Deploy skill from a row's menu in the Inventory", async () => {
    stubServer(() => ({ global: TWO_TOOLS }));
    renderDeployState();

    await userEvent.click(
      within(await findRow("Codex")).getByRole("button", {
        name: "Actions for Codex",
      }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Deploy skill" }),
    );

    expect(await screen.findByText("inventory view")).toBeInTheDocument();
  });

  it("keeps rows free of buttons other than the ⋮ menu", async () => {
    stubServer(() => ({ global: TWO_TOOLS }));
    renderDeployState();

    const row = await findRow("Claude Code");
    expect(
      within(row)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Actions for Claude Code"]);
  });

  it("names the Global/Repository split Target in Filter and Display", async () => {
    stubServer(() => ({ global: TWO_TOOLS }));
    renderDeployState();
    await findRow("Codex");

    await userEvent.click(screen.getByRole("button", { name: /^Filter/ }));
    const filter = await screen.findByRole("menu");
    expect(within(filter).getByText("Target")).toBeInTheDocument();
    expect(within(filter).queryByText("Kind")).toBeNull();
    await userEvent.keyboard("{Escape}");

    await userEvent.click(screen.getByRole("button", { name: /^Display/ }));
    expect(
      await screen.findByRole("menuitemradio", { name: "Target" }),
    ).toBeInTheDocument();
  });

  it("offers Status in Display and groups an unread target under Not read yet", async () => {
    stubServer(() => ({
      repos: ["/Users/me/a", "/Users/me/b"],
      global: TWO_TOOLS,
      repo: { "/Users/me/a": new Promise(() => {}) },
    }));
    renderDeployState();
    await waitFor(() => expect(cellsOf("Claude Code")[2]).toBe("In sync"));

    await userEvent.click(screen.getByRole("button", { name: /^Display/ }));
    await userEvent.click(
      await screen.findByRole("menuitemradio", { name: "Status" }),
    );
    await userEvent.keyboard("{Escape}");

    const rows = within(grid()).getAllByRole("row").slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      "In sync 1",
      expect.stringContaining("Claude Code"),
      "Empty 2",
      expect.stringContaining("Codex"),
      expect.stringContaining("…/me/b"),
      "Not read yet 1",
      expect.stringContaining("…/me/a"),
    ]);
  });

  it("filters the table by status and says why no row shows", async () => {
    stubServer(() => ({ global: TWO_TOOLS }));
    renderDeployState();
    await findRow("Codex");
    await waitFor(() => expect(cellsOf("Claude Code")[2]).toBe("In sync"));

    await userEvent.click(screen.getByRole("button", { name: /^Filter/ }));
    await userEvent.click(
      await screen.findByRole("menuitemcheckbox", { name: "Behind" }),
    );
    await userEvent.keyboard("{Escape}");

    expect(
      await screen.findByText(
        "No targets match the filters. Select Filter to show more targets.",
      ),
    ).toBeInTheDocument();
  });
});
