import { screen, waitFor, within } from "@testing-library/react";
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

// A target's detail pane on Deploy-state (#993, #1043). Successor of the
// retired DeployStatePanel, GlobalTargets, PinnedPerSkillHead,
// ReleaseHeadMeta and UnfinishedOperationHead tests for what a target states.

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

const repoWith = (body: object, drift: object = { behind: [] }) =>
  stubServer(() => ({
    repos: [REPO],
    repo: { [REPO]: { primitives: [skill("tdd")], skipped: [], ...body } },
    drift: { [REPO]: drift },
  }));

describe("Deploy-state pane — facts", () => {
  it("opens from a row, naming the target, its kind, path and releases", async () => {
    repoWith({ releaseHead: BEHIND });
    renderDeployState();

    const pane = await openPane(LABEL);

    expect(
      within(pane).getByRole("heading", { level: 2, name: LABEL }),
    ).toBeInTheDocument();
    expect(within(pane).getByText("Repository")).toBeInTheDocument();
    expect(within(pane).getByText(REPO)).toBeInTheDocument();
    expect(within(pane).getByText("v0.3.4")).toBeInTheDocument();
    expect(
      within(pane).getByText("Newer release v0.3.4: 2 of 5 skills changed"),
    ).toBeInTheDocument();
    expect(
      within(pane).getByText("Compared with the Harness, read just now"),
    ).toBeInTheDocument();
  });

  it("still states a release that changes nothing selected", async () => {
    repoWith({ releaseHead: { ...BEHIND, changed: 0, changedSkills: [] } });
    renderDeployState();

    const pane = await openPane(LABEL);
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
    expect(
      within(pane).getByText("Compared with the Harness, read just now"),
    ).toBeInTheDocument();
    expect(within(pane).queryByText(/skills changed/)).not.toBeInTheDocument();
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
    expect(
      within(pane).getByText(
        "Newer release v0.3.4. Changes could not be read.",
      ),
    ).toBeInTheDocument();
    expect(
      within(pane).getByText("Compared with the Harness, read 30 min ago"),
    ).toBeInTheDocument();
  });

  it("states no release for a target that follows no single release", async () => {
    repoWith({});
    renderDeployState();

    const pane = await openPane(LABEL);
    expect(within(pane).queryByText("Release")).not.toBeInTheDocument();
    expect(
      within(pane).queryByText(/Compared with the Harness/),
    ).not.toBeInTheDocument();
    // The row's own release is the only reading left, so it stays.
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
    expect(
      within(pane).getByText("1 skill at v0.3.1, 1 at v0.3.0"),
    ).toBeInTheDocument();
    expect(
      within(pane).getByText(
        "Release not adopted. Select Remove skill for each, then Deploy skill.",
      ),
    ).toBeInTheDocument();
    expect(within(pane).queryByRole("status")).not.toBeInTheDocument();
    // No mechanism stands behind an Update here (#950).
    expect(
      within(pane).queryByRole("button", { name: /update target/i }),
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
    expect(
      within(pane).getByText(
        "Extra files deployed: 2 files outside the selected skills.",
      ),
    ).toBeInTheDocument();
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
    expect(
      await within(pane).findByRole("img", { name: "Unverified" }),
    ).toHaveAttribute(
      "title",
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
    // The trigger went with the row, so focus never falls to the page body.
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
      within(pane).getByRole("button", { name: "Retry update" }),
    ).toBeInTheDocument();
    // One unfinished change is converged before another starts (#951).
    expect(
      within(pane).queryByRole("button", { name: /Update target/ }),
    ).toBeNull();
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
      within(pane).getByRole("button", { name: "Retry removal" }),
    ).toBeInTheDocument();
  });

  it("runs the retry once, and blocks a second while it runs", async () => {
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
    await userEvent.click(
      within(pane).getByRole("button", { name: "Retry deploy" }),
    );

    expect(retries).toEqual([
      JSON.stringify({ target: { kind: "repo", repoPath: REPO } }),
    ]);
    await waitFor(() =>
      expect(
        within(pane).getByRole("button", { name: "Retry deploy" }),
      ).toBeDisabled(),
    );
    // Nor can the row's menu start a second one (#1067: kept, disabled).
    await userEvent.click(
      within(await findRow(LABEL)).getByRole("button", {
        name: `Actions for ${LABEL}`,
      }),
    );
    const running = await screen.findByRole("menuitem", {
      name: "Retry deploy — already running",
    });
    expect(running).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(running);
    expect(retries).toHaveLength(1);
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
    ).toEqual([
      "Deploy skill",
      "Update target — unfinished operation",
      "Retry update",
    ]);
  });
});
