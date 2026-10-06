import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, sentence } from "../test-utils";
import {
  factValue,
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

// The value alone: a control beside it is not part of the fact.
const fact = (pane: HTMLElement, label: string) => {
  const value = factValue(pane, label)?.cloneNode(true) as
    | HTMLElement
    | undefined;
  for (const control of value?.querySelectorAll("button") ?? []) {
    control.remove();
  }
  return value?.textContent ?? null;
};

const footOf = (pane: HTMLElement) =>
  within(pane)
    .getByRole("button", { name: "Deploy skill" })
    .closest("div") as HTMLElement;

const footLabels = (pane: HTMLElement) =>
  within(footOf(pane))
    .getAllByRole("button")
    .map((button) => button.textContent);

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
    expect(fact(pane, "Changed")).toBe("2 of 5 skills: tdd and grill");
    expect(fact(pane, "Compared")).toBe("Read just now");
    // #1272: the facts state the release; no sentence repeats them.
    expect(
      within(pane).queryByText(/New release available/),
    ).not.toBeInTheDocument();
  });

  // #1182: the value is the link, so its name starts with the tag.
  it("links a repository's Release fact to its release page on GitHub", async () => {
    const url = "https://github.com/fimoklei/agent-harness/releases/tag/v0.3.2";
    repoWith({ releaseHead: BEHIND, releaseGitHub: { kind: "link", url } });
    renderDeployState();
    const pane = await openPane(LABEL);

    const link = within(pane).getByRole("link", { name: "v0.3.2 on GitHub" });
    expect(link).toHaveAttribute("href", url);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).not.toHaveAttribute("tabindex");
    expect(fact(pane, "Release")).toBe("v0.3.2");
  });

  it("links a global tool's Release fact to its release page on GitHub", async () => {
    const url = "https://github.com/fimoklei/agent-harness/releases/tag/v0.3.2";
    stubServer(() => ({
      global: {
        tools: [
          {
            tool: "claude",
            primitives: [skill("tdd")],
            releaseHead: BEHIND,
            releaseGitHub: { kind: "link", url },
          },
        ],
        skipped: [],
      },
    }));
    renderDeployState();
    const pane = await openPane("Claude Code");

    expect(
      within(pane).getByRole("link", { name: "v0.3.2 on GitHub" }),
    ).toHaveAttribute("href", url);
  });

  it("keeps the Release fact plain text where its page is unknown or absent", async () => {
    repoWith({ releaseHead: BEHIND, releaseGitHub: { kind: "unknown" } });
    renderDeployState();
    const pane = await openPane(LABEL);

    expect(fact(pane, "Release")).toBe("v0.3.2");
    expect(
      within(pane).queryByRole("link", { name: /on GitHub$/ }),
    ).not.toBeInTheDocument();
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

  // A narrow pane shortens the names; focus still reads them all (#1394).
  it("shows every changed skill when the Changed value is focused", async () => {
    repoWith({ releaseHead: BEHIND });
    renderDeployState();
    const pane = await openPane(LABEL);

    within(pane).getByText("2 of 5 skills: tdd and grill").focus();

    expect(
      await screen.findByRole("tooltip", { hidden: true }),
    ).toHaveTextContent("2 of 5 skills: tdd and grill");
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
    expect(fact(pane, "Latest release")).toBe("v0.3.4");
    expect(fact(pane, "Changed")).toBe("0 of 5 skills");
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
    const tags = within(pane).getByText(
      sentence("1 skill at v0.3.1, 1 at v0.3.0."),
    );
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

  it("keeps every line the Status hover card drops (#1394)", async () => {
    repoWith(
      {
        primitives: [skill("tdd", "v0.3.2", "local-edits"), skill("grill")],
        skipped: [
          {
            reason: "unmanageable-skill",
            virtualPath: "skills/jobs",
            packageType: "hybrid",
          },
        ],
        releaseHead: BEHIND,
      },
      {
        behind: [
          {
            name: "grill",
            current: "v0.3.2",
            latest: "v0.3.4",
            reading: "behind",
          },
        ],
      },
    );
    renderDeployState();

    const pane = await openPane(LABEL);
    expect(
      within(pane).getByText(
        sentence(
          "1 skill has changes that are not in the latest release: tdd. Select Import local edits to keep them.",
        ),
      ),
    ).toBeInTheDocument();
    expect(
      within(pane).getByText(
        sentence(
          "skills/jobs is deployed as hybrid, not as a skill. Fix the skill in the Harness. Select Create a release on the Harness screen, then deploy again.",
        ),
      ),
    ).toBeInTheDocument();
    expect(fact(pane, "Latest release")).toBe("v0.3.4");
    expect(fact(pane, "Changed")).toBe("2 of 5 skills: tdd and grill");
    expect(
      within(pane).getByRole("button", { name: /^Update target/ }),
    ).toBeInTheDocument();
    expect(fact(pane, "Compared")).toMatch(/^Read /);
    expect(
      await within(pane).findByRole("img", { name: "Behind" }),
    ).toBeInTheDocument();
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
      within(pane).getByText(sentence(/skills\/tdd is deployed as hybrid/i)),
    ).toBeInTheDocument();
    expect(
      within(pane).getByText(/Select Create a release on the Harness screen/),
    ).toBeInTheDocument();
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
        sentence(
          "Holds skills, hooks and MCP servers deployed from fimoklei/agent-harness.",
        ),
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
    expect(mark).toHaveAccessibleDescription("Update check did not run.");
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
        sentence(
          "Update to v0.3.4 incomplete: 1 of 2 skills now use this release.",
        ),
      ),
    ).toBeInTheDocument();
    expect(
      within(pane).getAllByRole("button", { name: "Retry update" }),
    ).toHaveLength(1);
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
        sentence(
          "Part of the selection is not on disk. Select Retry deploy to install release v0.3.4 again.",
        ),
      ),
    ).toBeInTheDocument();
  });

  it("offers Retry removal on an unfinished removal", async () => {
    pendingRepo({ kind: "remove", release: "v0.3.4", desired: ["tdd"] });
    renderDeployState();

    const pane = await openPane(LABEL);
    expect(within(pane).getByText("Removal incomplete")).toBeInTheDocument();
    expect(
      within(within(pane).getByRole("status")).getByRole("button", {
        name: "Retry removal",
      }),
    ).toBeInTheDocument();
    expect(
      within(pane).getAllByRole("button", { name: "Retry removal" }),
    ).toHaveLength(1);
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

  // #1272: the retry sits in its notice alone, as the pane's one primary.
  it("offers the retry in its notice only, as the one primary", async () => {
    pendingRepo({ kind: "update", release: "v0.3.4", desired: ["tdd"] });
    renderDeployState();

    const pane = await openPane(LABEL);
    expect(footLabels(pane)).toEqual(["Deploy skill"]);
    expect(
      within(footOf(pane)).getByRole("button", { name: "Deploy skill" }),
    ).not.toHaveClass("bg-gray-12");
    expect(
      within(within(pane).getByRole("status")).getByRole("button", {
        name: "Retry update",
      }),
    ).toHaveClass("bg-gray-12");
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

// #1272: each action beside its reason; the primary chosen by state.
describe("Deploy-state pane — where each action sits", () => {
  const edited = (name: string) => skill(name, "v0.3.2", "local-edits");

  it("keeps Deploy skill quiet at the foot of an In sync target", async () => {
    repoWith({ releaseHead: { ...BEHIND, release: "v0.3.4", changed: 0 } });
    renderDeployState();

    const pane = await openPane(LABEL);
    expect(footLabels(pane)).toEqual(["Deploy skill"]);
    for (const button of within(pane).getAllByRole("button")) {
      expect(button).not.toHaveClass("bg-gray-12");
    }
  });

  it("puts Update target beside Latest release, and makes Import local edits the primary it would otherwise discard", async () => {
    repoWith({ primitives: [edited("tdd")], releaseHead: BEHIND });
    renderDeployState();

    const pane = await openPane(LABEL);
    expect(
      within(factValue(pane, "Latest release") as HTMLElement).getByRole(
        "button",
        { name: `Update target ${LABEL}` },
      ),
    ).not.toHaveClass("bg-gray-12");
    expect(footLabels(pane)).toEqual(["Import local edits", "Deploy skill"]);
    expect(
      within(footOf(pane)).getByRole("button", { name: "Import local edits" }),
    ).toHaveClass("bg-gray-12");
    expect(
      within(pane).getByText(
        sentence(
          "1 skill has changes that are not in the latest release: tdd. Select Import local edits to keep them.",
        ),
      ),
    ).toBeInTheDocument();
  });

  it("makes Import local edits the primary at the foot when the target is not behind", async () => {
    repoWith({ primitives: [edited("tdd")] });
    renderDeployState();

    const pane = await openPane(LABEL);
    expect(footLabels(pane)).toEqual(["Import local edits", "Deploy skill"]);
    expect(
      within(footOf(pane)).getByRole("button", { name: "Import local edits" }),
    ).toHaveClass("bg-gray-12");
  });
  it("leaves out the local-edits sentence while an operation withholds Import local edits", async () => {
    repoWith({
      primitives: [edited("tdd")],
      pendingOperation: { kind: "deploy", release: "v0.3.2", desired: ["tdd"] },
    });
    renderDeployState();

    const pane = await openPane(LABEL);
    expect(within(pane).getByText("Deploy incomplete")).toBeInTheDocument();
    expect(
      within(pane).queryByText(/changes that are not in the latest release/),
    ).not.toBeInTheDocument();
  });
});
