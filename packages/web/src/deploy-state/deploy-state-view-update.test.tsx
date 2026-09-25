import type { UpdatePreview } from "@maestro/core";
import { focusManager } from "@tanstack/react-query";
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../test-utils";
import {
  findRow,
  openPane,
  renderDeployState,
  type ServerState,
  stubServer,
} from "./deploy-state-test-helpers";

// Update target from Deploy-state (#954, #980, #1043). Successor of the
// retired DeployStatePanel and GlobalDeployStatePanel Update tests.

afterEach(() => {
  vi.unstubAllGlobals();
});

const PREVIEW: UpdatePreview = {
  release: "v0.3.4",
  chosenRelease: "v0.3.5",
  counts: { changed: 1, removed: 0, unchanged: 0 },
  addedByThisDeploy: [],
  changed: [{ name: "tdd", url: null }],
  removed: [],
  unchanged: [],
  newInRelease: [],
  localEdits: { discard: [], unverified: [] },
  selection: { current: ["tdd"], desired: ["tdd"] },
  copyReceipt: null,
  token: "a".repeat(64),
};

const headAt = (release: string) => ({
  release,
  latestRelease: "v0.3.5",
  changed: release === "v0.3.5" ? 0 : 1,
  changedSkills: release === "v0.3.5" ? [] : ["tdd"],
  selection: ["tdd"],
  selected: 1,
  comparedAt: "2026-09-14T10:00:00.000Z",
});

const toolAt = (release: string) => ({
  tool: "claude",
  primitives: [{ type: "skill", name: "tdd", version: release }],
  releaseHead: headAt(release),
});

const PENDING = { kind: "update", release: "v0.3.5", desired: ["tdd"] };

const REPO = "/Users/me/project";
const repoAt = (release: string, pendingOperation?: object) => ({
  primitives: [{ type: "skill", name: "tdd", version: release }],
  skipped: [],
  releaseHead: headAt(release),
  ...(pendingOperation ? { pendingOperation } : {}),
});

// The server reads `before` until the update is sent, `during` while it runs
// and `after` once it answers.
function stubUpdate(
  answer: Promise<Response>,
  states: { before: ServerState; during?: ServerState; after: ServerState },
) {
  let phase: "before" | "during" | "after" = "before";
  void answer.then(() => {
    phase = "after";
  });
  return stubServer(() => ({
    ...(states[phase] ?? states.before),
    other: (url) => {
      if (url === "/api/deploy/update/preflight") {
        return jsonResponse({ preview: PREVIEW });
      }
      if (url === "/api/deploy/update") {
        phase = "during";
        return answer;
      }
      throw new Error(`unexpected request ${url}`);
    },
  }));
}

async function confirmUpdate(target: string) {
  const pane = await openPane(target);
  await userEvent.click(
    within(pane).getByRole("button", { name: /^Update target/ }),
  );
  const dialog = await screen.findByRole("dialog");
  await userEvent.click(
    await within(dialog).findByRole("button", { name: "Update target" }),
  );
  return dialog;
}

const deferred = () => {
  let resolve: (response: Response) => void = () => {};
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe("Deploy-state — Update target on a repository", () => {
  it("offers Update target on a behind target, named by the target", async () => {
    stubServer(() => ({ repos: [REPO], repo: { [REPO]: repoAt("v0.3.4") } }));
    renderDeployState();

    const pane = await openPane("…/me/project");
    await userEvent.click(
      within(pane).getByRole("button", {
        name: "Update target …/me/project",
      }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Update …/me/project" }),
    ).toBeInTheDocument();
  });

  // #1125: the foot holds only what the target's state calls for.
  it("offers no Update target on a target already on the latest release", async () => {
    stubServer(() => ({ repos: [REPO], repo: { [REPO]: repoAt("v0.3.5") } }));
    renderDeployState();

    const pane = await openPane("…/me/project");
    expect(
      within(pane).queryByRole("button", { name: /^Update target/ }),
    ).not.toBeInTheDocument();
    expect(
      within(pane).queryByRole("button", { name: /^Retry/ }),
    ).not.toBeInTheDocument();
  });

  it("lists only Deploy skill in an In sync target's menu, and says why on hover", async () => {
    stubServer(() => ({ repos: [REPO], repo: { [REPO]: repoAt("v0.3.5") } }));
    renderDeployState();

    const row = await findRow("…/me/project");
    await userEvent.click(
      within(row).getByRole("button", { name: "Actions for …/me/project" }),
    );
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Deploy skill"]);
    await userEvent.keyboard("{Escape}");

    await userEvent.hover(within(row).getByText("In sync"));
    expect(
      await screen.findByText("On the latest release."),
    ).toBeInTheDocument();
  });

  it("opens Update target straight from the row's menu", async () => {
    stubServer(() => ({
      repos: [REPO],
      repo: { [REPO]: repoAt("v0.3.4") },
      other: () => jsonResponse({ preview: PREVIEW }),
    }));
    renderDeployState();

    await userEvent.click(
      within(await findRow("…/me/project")).getByRole("button", {
        name: "Actions for …/me/project",
      }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Update target" }),
    );

    expect(
      await screen.findByRole("dialog", { name: "Update …/me/project" }),
    ).toBeInTheDocument();
  });

  it("keeps the dialog when a mid-run read finds the update unfinished", async () => {
    const update = deferred();
    stubUpdate(update.promise, {
      before: { repos: [REPO], repo: { [REPO]: repoAt("v0.3.4") } },
      during: { repos: [REPO], repo: { [REPO]: repoAt("v0.3.4", PENDING) } },
      after: { repos: [REPO], repo: { [REPO]: repoAt("v0.3.5") } },
    });
    renderDeployState();

    const dialog = await confirmUpdate("…/me/project");
    await within(dialog).findByRole("button", { name: "Updating to v0.3.5…" });
    // A window focus re-reads the deploy-state while apm still runs.
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await screen.findByText("Mixed releases");

    expect(dialog).toBeInTheDocument();
    update.resolve(
      jsonResponse({
        release: "v0.3.5",
        outcome: [{ name: "tdd", tool: null, state: "updated" }],
      }),
    );
    expect(
      await within(dialog).findByText("tdd updated to v0.3.5"),
    ).toBeInTheDocument();
  });
});

describe("Deploy-state — Update target on the global target", () => {
  const GLOBAL_BEHIND = { global: { tools: [toolAt("v0.3.4")], skipped: [] } };

  it("keeps the dialog open while apm runs, nothing else reachable, then lists what landed", async () => {
    const update = deferred();
    stubUpdate(update.promise, {
      before: GLOBAL_BEHIND,
      after: { global: { tools: [toolAt("v0.3.5")], skipped: [] } },
    });
    renderDeployState();

    const dialog = await confirmUpdate("Claude Code");
    expect(
      await within(dialog).findByRole("button", {
        name: "Updating to v0.3.5…",
      }),
    ).toBeDisabled();
    // Story 27: no control outside the dialog can start a second operation.
    for (const button of screen.queryAllByRole("button")) {
      expect(dialog).toContainElement(button);
    }

    update.resolve(
      jsonResponse({
        release: "v0.3.5",
        outcome: [{ name: "tdd", tool: null, state: "updated" }],
      }),
    );
    expect(
      await within(dialog).findByText("tdd updated to v0.3.5"),
    ).toBeInTheDocument();
  });

  it("names every detected tool it covers", async () => {
    stubServer(() => ({
      global: {
        tools: [toolAt("v0.3.4"), { ...toolAt("v0.3.4"), tool: "codex" }],
        skipped: [],
      },
    }));
    renderDeployState();

    const pane = await openPane("Codex");
    expect(
      within(pane).getByRole("button", {
        name: "Update target Claude Code and Codex",
      }),
    ).toBeInTheDocument();
  });

  it("shows an incomplete update's outcome and Retry update in the dialog", async () => {
    const update = deferred();
    stubUpdate(update.promise, {
      before: GLOBAL_BEHIND,
      after: {
        global: {
          tools: [toolAt("v0.3.4")],
          skipped: [],
          pendingOperation: PENDING,
        },
      },
    });
    renderDeployState();

    const dialog = await confirmUpdate("Claude Code");
    await within(dialog).findByRole("button", { name: "Updating to v0.3.5…" });
    update.resolve(
      jsonResponse(
        {
          error: "update-incomplete",
          message: "irrelevant",
          outcome: [
            { name: "tdd", tool: "claude", state: "updated" },
            { name: "tdd", tool: "codex", state: "not-updated" },
          ],
        },
        502,
      ),
    );

    expect(
      await within(dialog).findByText("tdd still at v0.3.4 in Codex"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Update incomplete")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Retry update" }),
    ).toBeInTheDocument();
  });

  it("keeps the dialog and offers no second operation when a mid-run read finds the update unfinished", async () => {
    const update = deferred();
    stubUpdate(update.promise, {
      before: GLOBAL_BEHIND,
      during: {
        global: {
          tools: [toolAt("v0.3.4")],
          skipped: [],
          pendingOperation: PENDING,
        },
      },
      after: { global: { tools: [toolAt("v0.3.5")], skipped: [] } },
    });
    renderDeployState();

    const dialog = await confirmUpdate("Claude Code");
    await within(dialog).findByRole("button", { name: "Updating to v0.3.5…" });
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await screen.findByText("Mixed releases");

    expect(dialog).toBeInTheDocument();
    for (const button of screen.queryAllByRole("button")) {
      expect(dialog).toContainElement(button);
    }
    update.resolve(
      jsonResponse({
        release: "v0.3.5",
        outcome: [{ name: "tdd", tool: null, state: "updated" }],
      }),
    );
    expect(
      await within(dialog).findByText("tdd updated to v0.3.5"),
    ).toBeInTheDocument();
  });
});
