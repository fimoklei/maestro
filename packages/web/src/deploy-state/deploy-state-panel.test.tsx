import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { DeployStatePanel } from "./deploy-state-panel";

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPanel(repo: string) {
  return renderWithQuery(
    <DeployStatePanel repo={repo} onStartDeploy={() => {}} />,
  );
}

describe("DeployStatePanel", () => {
  it("lists deployed skills with their human tag version", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
            skipped: [],
          },
          200,
        ),
      ),
    );
    renderPanel("/Users/me/project");

    expect(await screen.findByText("tdd")).toBeInTheDocument();
    expect(screen.getByText("v0.5.0")).toBeInTheDocument();
  });

  it("states an empty repo in its header status, not as an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ primitives: [], skipped: [] }, 200)),
    );
    renderPanel("/Users/me/project");

    expect(await screen.findByText("● Empty")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the skipped warning, not an empty state, when only unsupported entries are deployed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            primitives: [],
            skipped: [
              {
                reason: "unsupported-type",
                virtualPath: "hooks/format",
                packageType: "claude_hook",
              },
            ],
          },
          200,
        ),
      ),
    );
    renderPanel("/Users/me/project");

    expect(await screen.findByText(/hooks\/format/)).toBeInTheDocument();
    // Something IS deployed (just unsupported) — the cockpit must not say it is
    // empty, the lie J02 exists to prevent.
    expect(screen.queryByText("● Empty")).not.toBeInTheDocument();
  });

  it("reads a repo holding an invalid record as attention, never as in sync", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).startsWith("/api/drift")
          ? jsonResponse({ behind: [] }, 200)
          : jsonResponse(
              {
                primitives: [],
                skipped: [
                  {
                    reason: "invalid-package",
                    virtualPath: "skills/tdd",
                    packageType: "invalid",
                  },
                ],
              },
              200,
            ),
      ),
    );
    renderPanel("/Users/me/project");

    expect(await screen.findByText("▲ Attention")).toBeInTheDocument();
    expect(screen.getByText(/landed no files/i)).toBeInTheDocument();
    expect(screen.queryByText("● In sync")).not.toBeInTheDocument();
  });

  it("surfaces a visible error when the lockfile cannot be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ error: "malformed", message: "irrelevant" }, 422),
      ),
    );
    renderPanel("/Users/me/project");

    // The whole sentence, recovery included: a read failure with no way out
    // leaves the user guessing.
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Deploy-state not readReload the page to read this repository's deploy-state again.",
    );
  });

  it("moves focus to the card header once a removed row is gone", async () => {
    // One stub for the panel's two reads plus the removal: the row exists,
    // nothing is behind, and apm confirms the removal.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/deploy-state")) {
          return jsonResponse(
            {
              primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
              skipped: [],
            },
            200,
          );
        }
        if (url.startsWith("/api/drift")) {
          return jsonResponse({ behind: [] }, 200);
        }
        return jsonResponse({ removed: { type: "skill", name: "tdd" } }, 200);
      }),
    );
    renderPanel("/Users/me/project");

    await userEvent.click(
      await screen.findByRole("button", { name: "Actions for tdd" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Remove skill" }),
    );
    // Fixed label: the skill name left the confirm with #411, because the
    // dialog's title already carries it.
    await userEvent.click(screen.getByRole("button", { name: "Remove skill" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    // The trigger the modal would restore focus to went with the row, so the
    // card's own header takes it — focus never falls to the page body.
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /project/ })).toHaveFocus();
    });
  });

  it("warns about an entry it skipped instead of dropping it silently", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
            skipped: [
              {
                reason: "unsupported-type",
                virtualPath: "hooks/format",
                packageType: "claude_hook",
              },
            ],
          },
          200,
        ),
      ),
    );
    renderPanel("/Users/me/project");

    expect(await screen.findByText("tdd")).toBeInTheDocument();
    expect(screen.getByText(/hooks\/format/)).toBeInTheDocument();
  });
});

// The Release head: a target following one Harness release (ADR-0031).
describe("DeployStatePanel Release head", () => {
  const stubDeployState = (releaseHead: unknown, names = ["tdd", "grill"]) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.startsWith("/api/deploy-state")
          ? jsonResponse(
              {
                primitives: names.map((name) => ({
                  type: "skill",
                  name,
                  version: "v0.3.2",
                })),
                skipped: [],
                ...(releaseHead === undefined ? {} : { releaseHead }),
              },
              200,
            )
          : jsonResponse({ behind: [] }, 200),
      ),
    );
  };

  const BEHIND = {
    release: "v0.3.2",
    latestRelease: "v0.3.4",
    changed: 2,
    selected: 5,
    comparedAt: new Date().toISOString(),
  };

  it("leads the header with the release the target follows", async () => {
    stubDeployState(BEHIND);
    renderPanel("/Users/me/project");

    expect(await screen.findByText("Release v0.3.2")).toBeInTheDocument();
  });

  it("states the newer release and how much of the selection it changes", async () => {
    stubDeployState(BEHIND);
    renderPanel("/Users/me/project");

    expect(
      await screen.findByText("Newer release v0.3.4: 2 of 5 skills changed"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Compared with the Harness, read just now"),
    ).toBeInTheDocument();
  });

  it("still states a release that changes nothing selected", async () => {
    stubDeployState({ ...BEHIND, changed: 0 });
    renderPanel("/Users/me/project");

    expect(
      await screen.findByText("Newer release v0.3.4: 0 of 5 skills changed"),
    ).toBeInTheDocument();
  });

  it("offers one Update target control on a behind target", async () => {
    stubDeployState(BEHIND);
    renderPanel("/Users/me/project");

    expect(
      await screen.findByRole("button", { name: "Update target …/me/project" }),
    ).toBeInTheDocument();
  });

  it("reads a behind target as behind, never as in sync", async () => {
    stubDeployState(BEHIND);
    renderPanel("/Users/me/project");

    expect(await screen.findByText("▲ Behind")).toBeInTheDocument();
    expect(screen.queryByText("● In sync")).not.toBeInTheDocument();
  });

  it("offers no Update target control on a target already on the latest release", async () => {
    stubDeployState({ ...BEHIND, release: "v0.3.4", changed: 0 });
    renderPanel("/Users/me/project");

    expect(await screen.findByText("Release v0.3.4")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Update target/ }),
    ).not.toBeInTheDocument();
  });

  it("opens the preview naming the target it acts on", async () => {
    const user = userEvent.setup();
    stubDeployState(BEHIND);
    renderPanel("/Users/me/project");

    await user.click(
      await screen.findByRole("button", { name: "Update target …/me/project" }),
    );

    expect(
      await screen.findByRole("dialog", { name: "Update …/me/project" }),
    ).toBeInTheDocument();
  });

  it("carries the read time alone for a target on the latest release", async () => {
    stubDeployState({ ...BEHIND, release: "v0.3.4", changed: 0 });
    renderPanel("/Users/me/project");

    expect(await screen.findByText("Release v0.3.4")).toBeInTheDocument();
    expect(
      screen.getByText("Compared with the Harness, read just now"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/skills changed/)).not.toBeInTheDocument();
  });

  it("names both releases and keeps the last read time when the changes could not be read", async () => {
    stubDeployState({
      ...BEHIND,
      changed: null,
      comparedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
    });
    renderPanel("/Users/me/project");

    expect(await screen.findByText("Release v0.3.2")).toBeInTheDocument();
    expect(
      screen.getByText("Newer release v0.3.4. Changes could not be read."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Compared with the Harness, read 30 min ago"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/skills changed/)).not.toBeInTheDocument();
  });

  it("states a row's release only where it differs from the head", async () => {
    stubDeployState(BEHIND);
    renderPanel("/Users/me/project");

    expect(await screen.findByText("tdd")).toBeInTheDocument();
    expect(screen.queryByText("v0.3.2")).not.toBeInTheDocument();
  });

  it("states a row's release where the row disagrees with the head", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.startsWith("/api/deploy-state")
          ? jsonResponse(
              {
                primitives: [
                  { type: "skill", name: "tdd", version: "v0.3.2" },
                  { type: "skill", name: "grill", version: "v0.3.1" },
                ],
                skipped: [],
                releaseHead: BEHIND,
              },
              200,
            )
          : jsonResponse({ behind: [] }, 200),
      ),
    );
    renderPanel("/Users/me/project");

    expect(await screen.findByText("grill")).toBeInTheDocument();
    expect(screen.getByText("v0.3.1")).toBeInTheDocument();
    expect(screen.queryByText("v0.3.2")).not.toBeInTheDocument();
  });

  it("marks a row whose copy was edited locally", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.startsWith("/api/deploy-state")
          ? jsonResponse(
              {
                primitives: [
                  {
                    type: "skill",
                    name: "tdd",
                    version: "v0.3.2",
                    copy: "local-edits",
                  },
                  {
                    type: "skill",
                    name: "grill",
                    version: "v0.3.2",
                    copy: "unverified",
                  },
                  { type: "skill", name: "jobs", version: "v0.3.2" },
                ],
                skipped: [],
                releaseHead: BEHIND,
              },
              200,
            )
          : jsonResponse({ behind: [] }, 200),
      ),
    );
    renderPanel("/Users/me/project");

    expect(await screen.findByText("Local edits")).toBeInTheDocument();
    expect(screen.getByText("Unverified")).toBeInTheDocument();
    expect(screen.getAllByText(/Local edits|Unverified/)).toHaveLength(2);
  });

  it("shows no Release head for a target that follows no single release", async () => {
    stubDeployState(undefined);
    renderPanel("/Users/me/project");

    expect(await screen.findByText("tdd")).toBeInTheDocument();
    expect(screen.queryByText(/^Release /)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Compared with the Harness/),
    ).not.toBeInTheDocument();
    // The per-row release is the only reading left, so it stays.
    expect(screen.getAllByText("v0.3.2")).toHaveLength(2);
  });
});

describe("DeployStatePanel on a target pinned per skill", () => {
  function stubDeployState(body: Record<string, unknown>) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).startsWith("/api/drift")
          ? jsonResponse({ behind: [] }, 200)
          : jsonResponse(body, 200),
      ),
    );
  }

  it("reads the status, the tags under it, and the way out", async () => {
    stubDeployState({
      primitives: [
        { type: "skill", name: "tdd", version: "v0.3.1" },
        { type: "skill", name: "jobs", version: "v0.3.0" },
      ],
      skipped: [],
      pinnedPerSkill: [
        { release: "v0.3.1", skills: 1 },
        { release: "v0.3.0", skills: 1 },
      ],
    });
    renderPanel("/Users/me/project");

    expect(await screen.findByText("▲ Pinned per skill")).toBeInTheDocument();
    expect(
      screen.getByText("1 skill at v0.3.1, 1 at v0.3.0"),
    ).toBeInTheDocument();
    expect(screen.getByText("Release not adopted")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This target was deployed one skill at a time. Select Remove skill for each skill, then Deploy skill to put them back on one release.",
      ),
    ).toBeInTheDocument();
  });

  it("offers no Update target, which no mechanism stands behind", async () => {
    stubDeployState({
      primitives: [{ type: "skill", name: "tdd", version: "v0.3.1" }],
      skipped: [],
      pinnedPerSkill: [{ release: "v0.3.1", skills: 1 }],
    });
    renderPanel("/Users/me/project");

    expect(await screen.findByText("tdd")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /update target/i }),
    ).not.toBeInTheDocument();
  });

  it("says nothing about pins a target on one release does not hold", async () => {
    stubDeployState({
      primitives: [{ type: "skill", name: "tdd", version: "v0.3.2" }],
      skipped: [],
    });
    renderPanel("/Users/me/project");

    expect(await screen.findByText("tdd")).toBeInTheDocument();
    expect(screen.queryByText("▲ Pinned per skill")).not.toBeInTheDocument();
    expect(screen.queryByText("Release not adopted")).not.toBeInTheDocument();
  });

  it("counts the deployed files that belong to no selected skill", async () => {
    stubDeployState({
      primitives: [{ type: "skill", name: "tdd", version: "v0.3.2" }],
      skipped: [],
      extraFiles: 2,
    });
    renderPanel("/Users/me/project");

    expect(
      await screen.findByText(
        "Extra files deployed: 2 files outside the selected skills.",
      ),
    ).toBeInTheDocument();
  });
});
