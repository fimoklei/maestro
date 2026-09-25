import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    expect(cellsOf("Claude Code")[0]).toBe("Claude Code~/.claude/skills");
    expect(cellsOf("Codex")[0]).toBe("Codex~/.agents/skills");
  });

  it("keeps two repositories that share a prefix apart, full path as the title", async () => {
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
    expect(
      screen.getByTitle("/Users/me/clientA/repos/agent-harness"),
    ).toBeInTheDocument();
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

    expect(
      await screen.findByText(
        "Nothing deployed — deploy a skill from Inventory",
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

  it("names where repositories come from while none is registered, as information only", async () => {
    stubServer(() => ({ repos: [], global: TWO_TOOLS }));
    renderDeployState();

    const hint = await screen.findByText(
      "No repositories registered. Select Register repository on the Repositories screen to register one.",
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

    expect(await screen.findByTitle("/Users/me/a")).toBeInTheDocument();
    expect(
      screen.queryByText(/no repositories registered\./i),
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

  it("sums up the status on hover: the newer release and when it was compared", async () => {
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

    expect(
      await screen.findByText("Newer release v0.3.4: 2 of 5 skills changed"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Compared with the Harness, read just now"),
    ).toBeInTheDocument();
  });
});

describe("Deploy-state — failed reads", () => {
  it("states a failed global read at the top, with its re-read, never as no tools", async () => {
    stubServer(() => ({
      global: { status: 422, body: { error: "malformed" } },
    }));
    renderDeployState();

    const notice = await screen.findByText("Global targets not read");
    expect(notice.closest("[role=status]")).toHaveTextContent(
      "Select Re-read Deploy-state to read the global targets again.",
    );
    expect(
      screen.queryByText(/install claude code or codex/i),
    ).not.toBeInTheDocument();
  });

  it("states a failed registry read, never the register hint", async () => {
    stubServer(() => ({ repos: { status: 500, body: { message: "boom" } } }));
    renderDeployState();

    expect(
      await screen.findByText("Registered repositories not read"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/no repositories registered\./i),
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

    expect(
      await screen.findByText(/install claude code or codex/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/hooks\/pre-commit is deployed as/i),
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
      expect(
        await screen.findByText("Compared with the Harness, read just now"),
      ).toBeInTheDocument();
      const reads = fetchMock.mock.calls.length;

      await act(() => vi.advanceTimersByTimeAsync(2 * 60_000));

      expect(screen.getByText("Read 2 min ago")).toBeInTheDocument();
      expect(
        screen.getByText("Compared with the Harness, read 2 min ago"),
      ).toBeInTheDocument();
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

    expect(screen.getByText("inventory view")).toBeInTheDocument();
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
