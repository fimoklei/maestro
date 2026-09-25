import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../test-utils";
import {
  findRow,
  grid,
  openPane,
  RECENT,
  renderDeployState,
  stubServer,
} from "./deploy-state-test-helpers";

// A target's detail pane on Deploy-state (#993, #1043).

afterEach(() => {
  vi.unstubAllGlobals();
});

const REPO = "/Users/me/project";
const LABEL = "…/me/project";

const skill = (name: string, version = "v0.3.2", copy?: string) => ({
  type: "skill",
  name,
  version,
  ...(copy ? { copy } : {}),
});

const BEHIND = {
  release: "v0.3.2",
  latestRelease: "v0.3.4",
  changed: 2,
  changedSkills: ["tdd", "grill"],
  selection: ["tdd", "grill"],
  selected: 5,
  comparedAt: RECENT(),
};

const fact = (pane: HTMLElement, label: string) =>
  within(pane)
    .queryAllByText(label)
    .find((element) => element.tagName === "DT")?.nextElementSibling
    ?.textContent ?? null;

const repoWith = (body: object, drift: object = { behind: [] }) =>
  stubServer(() => ({
    repos: [REPO],
    repo: { [REPO]: { primitives: [skill("tdd")], skipped: [], ...body } },
    drift: { [REPO]: drift },
  }));

describe("Deploy-state pane — facts", () => {
  it("opens from a row, naming the target, its target type, path and releases", async () => {
    repoWith({ releaseHead: BEHIND });
    renderDeployState();

    const pane = await openPane(LABEL);

    expect(
      within(pane).getByRole("heading", { level: 2, name: LABEL }),
    ).toBeInTheDocument();
    expect(fact(pane, "Target")).toBe("Repository");
    expect(fact(pane, "Path")).toBe(REPO);
    expect(fact(pane, "Release")).toBe("v0.3.2");
    expect(fact(pane, "Latest release")).toBe("v0.3.4");
    expect(fact(pane, "Changed")).toBe("2 of 5 skills");
    expect(fact(pane, "Compared")).toBe("Read just now");
    expect(
      within(pane).getByText("Newer release v0.3.4: 2 of 5 skills changed"),
    ).toBeInTheDocument();
  });

  it("shows the whole Path when its value is focused", async () => {
    repoWith({ releaseHead: BEHIND });
    renderDeployState();
    const pane = await openPane(LABEL);

    within(pane).getByText(REPO).focus();

    expect(
      await screen.findByRole("tooltip", { hidden: true }),
    ).toHaveTextContent(REPO);
  });

  it("shows the whole Path when its value is hovered", async () => {
    repoWith({ releaseHead: BEHIND });
    renderDeployState();
    const pane = await openPane(LABEL);

    await userEvent.hover(within(pane).getByText(REPO));

    expect(
      await screen.findByRole("tooltip", { hidden: true }),
    ).toHaveTextContent(REPO);
  });

  it("ticks the Compared fact while the pane stays open", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const fetchMock = repoWith({ releaseHead: BEHIND });
      renderDeployState();
      const pane = await openPane(LABEL);
      expect(fact(pane, "Compared")).toBe("Read just now");
      const reads = fetchMock.mock.calls.length;

      await act(() => vi.advanceTimersByTimeAsync(2 * 60_000));

      expect(fact(pane, "Compared")).toBe("Read 2 min ago");
      expect(fetchMock.mock.calls.length).toBe(reads);
    } finally {
      vi.useRealTimers();
    }
  });

  it("states every fact as one label/value row, in the order the pane reads", async () => {
    repoWith({ releaseHead: BEHIND, extraFiles: 2 });
    renderDeployState();

    const pane = await openPane(LABEL);
    const list = within(pane).getByText("Target").closest("dl");
    expect(list).toHaveClass("grid-cols-[auto_1fr]");
    expect(
      [...(list?.querySelectorAll("dt") ?? [])].map((dt) => dt.textContent),
    ).toEqual([
      "Target",
      "Path",
      "Release",
      "Latest release",
      "Changed",
      "Compared",
      "Extra files",
    ]);
  });

  it("still states a release that changes nothing selected", async () => {
    repoWith({ releaseHead: { ...BEHIND, changed: 0, changedSkills: [] } });
    renderDeployState();

    const pane = await openPane(LABEL);
    expect(fact(pane, "Changed")).toBe("0 of 5 skills");
    expect(
      within(pane).getByText("Newer release v0.3.4: 0 of 5 skills changed"),
    ).toBeInTheDocument();
  });

  it("carries the read time alone on the latest release", async () => {
    repoWith({
      releaseHead: {
        ...BEHIND,
        release: "v0.3.4",
        changed: 0,
        changedSkills: [],
      },
    });
    renderDeployState();

    const pane = await openPane(LABEL);
    expect(fact(pane, "Compared")).toBe("Read just now");
    expect(fact(pane, "Latest release")).toBeNull();
    expect(fact(pane, "Changed")).toBeNull();
  });

  it("names both releases and the last read time when the changes could not be read", async () => {
    repoWith({
      releaseHead: {
        ...BEHIND,
        changed: null,
        changedSkills: undefined,
        comparedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
      },
    });
    renderDeployState();

    const pane = await openPane(LABEL);
    expect(fact(pane, "Release")).toBe("v0.3.2");
    expect(fact(pane, "Latest release")).toBe("v0.3.4");
    expect(fact(pane, "Changed")).toBe("Could not be read");
    expect(fact(pane, "Compared")).toBe("Read 30 min ago");
    expect(
      within(pane).getByText(
        "Newer release v0.3.4. Changes could not be read.",
      ),
    ).toBeInTheDocument();
  });

  it("states no release for a target that follows no single release", async () => {
    repoWith({});
    renderDeployState();

    const pane = await openPane(LABEL);
    expect(fact(pane, "Release")).toBeNull();
    expect(fact(pane, "Compared")).toBeNull();
    expect(within(pane).getByText("v0.3.2")).toBeInTheDocument();
  });

  it("reads the tags and the way out on a target pinned per skill, in lines, not a notice", async () => {
    repoWith({
      primitives: [skill("tdd", "v0.3.1"), skill("jobs", "v0.3.0")],
      pinnedPerSkill: [
        { release: "v0.3.1", skills: 1 },
        { release: "v0.3.0", skills: 1 },
      ],
    });
    renderDeployState();

    const pane = await openPane(LABEL);
    const tags = within(pane).getByText("1 skill at v0.3.1, 1 at v0.3.0.");
    const way = within(pane).getByText(
      "Release not adopted. Select Remove skill for each, then Deploy skill.",
    );
    expect(tags.closest("p")).toBe(way.closest("p"));
    expect(within(pane).queryByRole("status")).not.toBeInTheDocument();
    expect(
      within(pane).queryByRole("button", { name: /^Update target/ }),
    ).not.toBeInTheDocument();
  });

  it("says nothing about pins a target on one release does not hold", async () => {
    repoWith({});
    renderDeployState();

    const pane = await openPane(LABEL);
    expect(within(grid()).queryByText("Pinned per skill")).toBeNull();
    expect(
      within(pane).queryByText(
        "Release not adopted. Select Remove skill for each, then Deploy skill.",
      ),
    ).not.toBeInTheDocument();
  });

  it("counts the deployed files that belong to no selected skill", async () => {
    repoWith({ extraFiles: 2 });
    renderDeployState();

    const pane = await openPane(LABEL);
    expect(fact(pane, "Extra files")).toBe("2 files");
  });

  it("warns about an entry it skipped instead of dropping it", async () => {
    repoWith({
      skipped: [
        {
          reason: "unmanageable-skill",
          virtualPath: "skills/tdd",
          packageType: "hybrid",
        },
      ],
    });
    renderDeployState();

    const pane = await openPane(LABEL);
    expect(
      within(pane).getByText(/skills\/tdd is deployed as hybrid/i),
    ).toBeInTheDocument();
    expect(within(pane).getByText(/publish a release/i)).toBeInTheDocument();
  });

  it("names the other origin a global target holds, keeping Deploy skill", async () => {
    stubServer(() => ({
      global: {
        tools: [{ tool: "claude", primitives: [] }],
        skipped: [],
        otherOrigins: ["fimoklei/agent-harness"],
      },
    }));
    renderDeployState();

    const pane = await openPane("Claude Code");
    expect(
      within(pane).getByText(
        "Holds primitives deployed from fimoklei/agent-harness.",
      ),
    ).toBeInTheDocument();
    expect(
      within(pane).getByRole("button", { name: "Deploy skill" }),
    ).toBeInTheDocument();
  });

  it("states a repository's failed read in its pane, with its re-read", async () => {
    stubServer(() => ({
      repos: [REPO],
      repo: { [REPO]: { status: 422, body: { error: "malformed" } } },
    }));
    renderDeployState();

    const pane = await openPane(LABEL);
    expect(within(pane).getByRole("status")).toHaveTextContent(
      "Deploy-state not readSelect Re-read Deploy-state to read this repository's deploy-state again.",
    );
    expect(
      within(pane).getByRole("button", { name: "Re-read Deploy-state" }),
    ).toBeInTheDocument();
  });

  it("pages through the targets as the table shows them", async () => {
    stubServer(() => ({
      repos: [REPO],
      global: { tools: [{ tool: "claude", primitives: [] }], skipped: [] },
    }));
    renderDeployState();
    await findRow(LABEL);

    const pane = await openPane("Claude Code");
    expect(within(pane).getByText("1 of 2")).toBeInTheDocument();

    await userEvent.keyboard("{ArrowDown}");
    expect(
      await screen.findByRole("complementary", { name: `${LABEL} detail` }),
    ).toBeInTheDocument();
  });
});

describe("Deploy-state pane — Selected skills", () => {
  it("lists each deployed skill with its version and one mark", async () => {
    repoWith(
      {
        primitives: [
          skill("tdd", "v0.3.2", "local-edits"),
          skill("grill", "v0.3.2", "unverified"),
          skill("jobs"),
        ],
      },
      {
        behind: [
          {
            name: "tdd",
            current: "v0.3.2",
            latest: "v0.3.4",
            reading: "behind",
          },
          {
            name: "jobs",
            current: "v0.3.2",
            latest: "v0.3.4",
            reading: "no-longer-released",
          },
        ],
      },
    );
    renderDeployState();

    const pane = await openPane(LABEL);
    await waitFor(() =>
      expect(
        within(pane)
          .getAllByRole("img")
          .map((mark) => mark.getAttribute("aria-label")),
      ).toEqual(["Local edits", "Unverified", "No longer released"]),
    );
  });

  it("reads unknown, never up to date, when the check could not run", async () => {
    repoWith({}, { ok: false });
    renderDeployState();

    const pane = await openPane(LABEL);
    expect(
      await within(pane).findByRole("img", { name: "Unknown" }),
    ).toBeInTheDocument();
    expect(within(pane).queryByRole("img", { name: "Up to date" })).toBeNull();
  });

  it("reads unverified, distinct from unknown, when the Harness could not be reached", async () => {
    repoWith({}, { ok: false, reason: "unverified" });
    renderDeployState();

    const pane = await openPane(LABEL);
    const mark = await within(pane).findByRole("img", { name: "Unverified" });
    await userEvent.hover(mark);
    await screen.findByRole("tooltip", { hidden: true });
    expect(mark).toHaveAccessibleDescription(
      "Could not reach the Harness location to check for updates",
    );
  });

  it("offers Remove skill on a no-longer-released skill, never an update", async () => {
    repoWith(
      {},
      {
        behind: [
          {
            name: "tdd",
            current: "v0.3.2",
            latest: "v0.3.4",
            reading: "no-longer-released",
          },
        ],
      },
    );
    renderDeployState();

    const pane = await openPane(LABEL);
    await within(pane).findByRole("img", { name: "No longer released" });
    expect(within(pane).queryByText(/→/)).not.toBeInTheDocument();
    await userEvent.click(
      within(pane).getByRole("button", { name: "Actions for tdd" }),
    );
    expect(
      await screen.findByRole("menuitem", { name: "Remove skill" }),
    ).toBeInTheDocument();
  });

  it("closes only the removal dialog on Escape, leaving the pane open", async () => {
    stubServer(() => ({
      repos: [REPO],
      repo: { [REPO]: { primitives: [skill("tdd")], skipped: [] } },
      other: () =>
        jsonResponse({
          check: { scope: "repo", warning: null },
          reclaim: null,
          receipt: "b".repeat(64),
        }),
    }));
    renderDeployState();

    const pane = await openPane(LABEL);
    const trigger = within(pane).getByRole("button", {
      name: "Actions for tdd",
    });
    await userEvent.click(trigger);
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Remove skill" }),
    );
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(pane).toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("moves focus to Selected skills once a removed row is gone", async () => {
    let removed = false;
    stubServer(() => ({
      repos: [REPO],
      repo: {
        [REPO]: { primitives: removed ? [] : [skill("tdd")], skipped: [] },
      },
      other: (url) => {
        if (url === "/api/deploy/remove/preflight") {
          return jsonResponse({
            check: { scope: "repo", warning: null },
            reclaim: null,
            receipt: "b".repeat(64),
          });
        }
        removed = true;
        return jsonResponse({ removed: { type: "skill", name: "tdd" } });
      },
    }));
    renderDeployState();

    const pane = await openPane(LABEL);
    await userEvent.click(
      within(pane).getByRole("button", { name: "Actions for tdd" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Remove skill" }),
    );
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", {
      name: "Remove skill",
    });
    await waitFor(() => expect(confirm).toBeEnabled());
    await userEvent.click(confirm);

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 3, name: /Selected skills/ }),
      ).toHaveFocus(),
    );
  });
});

describe("Deploy-state pane — an unfinished operation", () => {
  const pendingRepo = (pendingOperation: object, primitives = [skill("tdd")]) =>
    repoWith({ primitives, releaseHead: BEHIND, pendingOperation });

  it("states a half-landed update and offers Retry update, not another Update", async () => {
    pendingRepo(
      { kind: "update", release: "v0.3.4", desired: ["tdd", "grill"] },
      [skill("tdd", "v0.3.4"), skill("grill", "v0.3.2")],
    );
    renderDeployState();

    const pane = await openPane(LABEL);
    expect(within(pane).getByText("Update incomplete")).toBeInTheDocument();
    expect(
      within(pane).getByText(
        "The update is incomplete. Select Retry update to run the same release again.",
      ),
    ).toBeInTheDocument();
    expect(
      within(pane).getByText(
        "Update to v0.3.4 incomplete: 1 of 2 skills now use this release.",
      ),
    ).toBeInTheDocument();
    expect(
      within(pane).getAllByRole("button", { name: "Retry update" }),
    ).toHaveLength(2);
    expect(
      within(pane).queryByRole("button", { name: /^Update target/ }),
    ).not.toBeInTheDocument();
    expect(within(grid()).getByText("Mixed releases")).toBeInTheDocument();
  });

  it("names the release an unfinished deploy would install again", async () => {
    pendingRepo({ kind: "deploy", release: "v0.3.4", desired: ["tdd"] });
    renderDeployState();

    const pane = await openPane(LABEL);
    expect(within(pane).getByText("Deploy incomplete")).toBeInTheDocument();
    expect(
      within(pane).getByText(
        "Part of the selection is not on disk. Select Retry deploy to install release v0.3.4 again.",
      ),
    ).toBeInTheDocument();
  });

  it("offers Retry removal on an unfinished removal", async () => {
    pendingRepo({ kind: "remove", release: "v0.3.4", desired: ["tdd"] });
    renderDeployState();

    const pane = await openPane(LABEL);
    expect(within(pane).getByText("Removal incomplete")).toBeInTheDocument();
    expect(
      within(pane).getAllByRole("button", { name: "Retry removal" }),
    ).toHaveLength(2);
  });

  it("runs the retry once, and offers no second while it runs", async () => {
    const retries: string[] = [];
    stubServer(() => ({
      repos: [REPO],
      repo: {
        [REPO]: {
          primitives: [skill("tdd")],
          skipped: [],
          pendingOperation: {
            kind: "deploy",
            release: "v0.3.4",
            desired: ["tdd"],
          },
        },
      },
      other: (_url, init) => {
        retries.push(String(init?.body));
        return new Promise(() => {});
      },
    }));
    renderDeployState();

    const pane = await openPane(LABEL);
    const notice = within(pane).getByRole("status");
    await userEvent.click(
      within(notice).getByRole("button", { name: "Retry deploy" }),
    );

    expect(retries).toEqual([
      JSON.stringify({ target: { kind: "repo", repoPath: REPO } }),
    ]);
    await waitFor(() =>
      expect(
        within(notice).getByRole("button", { name: "Retry deploy" }),
      ).toBeDisabled(),
    );
    expect(
      within(pane).getAllByRole("button", { name: /^Retry deploy/ }),
    ).toHaveLength(1);
    await userEvent.click(
      within(await findRow(LABEL)).getByRole("button", {
        name: `Actions for ${LABEL}`,
      }),
    );
    expect(
      (await screen.findAllByRole("menuitem")).map((item) => item.textContent),
    ).toEqual(["Deploy skill"]);
    expect(retries).toHaveLength(1);
  });

  it("holds the row's menu at the foot, in its order, Retry update primary", async () => {
    pendingRepo({ kind: "update", release: "v0.3.4", desired: ["tdd"] });
    renderDeployState();

    const pane = await openPane(LABEL);
    const foot = within(pane)
      .getByRole("button", { name: "Deploy skill" })
      .closest("div") as HTMLElement;
    expect(
      within(foot)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Retry update", "Deploy skill"]);
    expect(
      within(foot).getByRole("button", { name: "Retry update" }),
    ).toHaveClass("bg-gray-12", "h-control");
    expect(
      within(foot).getByRole("button", { name: "Deploy skill" }),
    ).not.toHaveClass("bg-gray-12");
    expect(
      within(within(pane).getByRole("status")).getByRole("button", {
        name: "Retry update",
      }),
    ).toBeInTheDocument();
  });

  it("offers the retry in the row's menu too", async () => {
    pendingRepo({ kind: "update", release: "v0.3.4", desired: ["tdd"] });
    renderDeployState();

    await userEvent.click(
      within(await findRow(LABEL)).getByRole("button", {
        name: `Actions for ${LABEL}`,
      }),
    );
    expect(
      (await screen.findAllByRole("menuitem")).map((item) => item.textContent),
    ).toEqual(["Retry update", "Deploy skill"]);
  });
});
