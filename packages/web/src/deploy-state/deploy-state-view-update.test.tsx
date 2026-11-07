import type {
  FolderOutcomes,
  SkillOutcome,
  UpdatePreview,
} from "@maestro/core";
import { focusManager } from "@tanstack/react-query";
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hoverOpen, jsonResponse } from "../test-utils";
import {
  findRow,
  globalAnswer,
  openPane,
  renderDeployState,
  type ServerState,
  stubServer,
} from "./deploy-state-test-helpers";

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

// Global with tdd at `release` in the folder of each tool named.
const globalAt = (
  release: string,
  tools: readonly ("claude" | "codex")[] = ["claude"],
) => {
  const tdd = [{ type: "skill", name: "tdd", version: release }];
  return globalAnswer(Object.fromEntries(tools.map((tool) => [tool, tdd])), {
    releaseHead: headAt(release),
  });
};

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
  retry?: () => Response,
  preview: UpdatePreview = PREVIEW,
) {
  let phase: "before" | "during" | "after" = "before";
  void answer.then(() => {
    phase = "after";
  });
  return stubServer(() => ({
    ...(states[phase] ?? states.before),
    other: (url) => {
      if (url === "/api/deploy/update/preflight") {
        return jsonResponse({ preview });
      }
      if (url === "/api/deploy/update") {
        phase = "during";
        return answer;
      }
      if (url === "/api/deploy/retry" && retry) {
        return retry();
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

// A skill section of the Report, found by its heading.
const skillSection = (dialog: HTMLElement, label: string) =>
  within(dialog)
    .getByRole("heading", { level: 3, name: label })
    .closest("section") as HTMLElement;

// Global's per-folder outcome: Claude Code's folder, and Codex's when written.
const foldersAt = (
  release: string,
  claude: SkillOutcome[],
  codex: SkillOutcome[] | null = null,
) =>
  ({
    release,
    folders: [
      {
        path: "~/.claude/skills",
        tool: "claude",
        detected: true,
        skills: claude,
      },
      {
        path: "~/.agents/skills",
        tool: "codex",
        detected: codex !== null,
        skills: codex ?? [],
      },
    ],
  }) satisfies FolderOutcomes;

// The Report's `Written to` lines, each read as one string.
const writtenToLines = (dialog: HTMLElement) =>
  within(within(dialog).getByRole("group", { name: "Written to" }))
    .getAllByRole("listitem")
    .map((line) => line.textContent);

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

    await hoverOpen(within(row).getByText("In sync"));
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

  it("states a refused preview in the dialog, spelling out the rm for the linked folder", async () => {
    const linkedPath = "/Users/me/project/.claude/skills/tdd";
    stubServer(() => ({
      repos: [REPO],
      repo: { [REPO]: repoAt("v0.3.4") },
      other: () =>
        jsonResponse(
          { error: "destination-symlinked", message: "unused", linkedPath },
          409,
        ),
    }));
    renderDeployState();

    const pane = await openPane("…/me/project");
    await userEvent.click(
      within(pane).getByRole("button", { name: /^Update target/ }),
    );
    const dialog = await screen.findByRole("dialog");

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Linked skill folder" +
        `Nothing was written. Run rm ${linkedPath} and then select Update target again.` +
        "This removes the link only. The folder it points at remains on disk.",
    );
  });

  it("states a refused update in the dialog, with the way back to a fresh preview", async () => {
    stubUpdate(
      Promise.resolve(
        jsonResponse({ error: "status-out-of-date", message: "unused" }, 409),
      ),
      {
        before: { repos: [REPO], repo: { [REPO]: repoAt("v0.3.4") } },
        after: { repos: [REPO], repo: { [REPO]: repoAt("v0.3.4") } },
      },
    );
    renderDeployState();

    const dialog = await confirmUpdate("…/me/project");

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Status out of date" +
        "Nothing was changed. The target changed after the preview. Select Update target again.",
    );
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
    await within(dialog).findByRole("button", { name: "Updating…" });
    // A window focus re-reads the deploy-state while apm still runs.
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await within(
      screen.getByRole("grid", { name: "Deploy-state table", hidden: true }),
    ).findAllByText("Update incomplete");

    expect(dialog).toBeInTheDocument();
    update.resolve(
      jsonResponse({
        release: "v0.3.5",
        outcome: [{ name: "tdd", tool: null, state: "updated" }],
      }),
    );
    expect(
      await within(dialog).findByRole("heading", {
        level: 3,
        name: "Updated to v0.3.5",
      }),
    ).toBeInTheDocument();
    expect(
      within(skillSection(dialog, "Changed")).getByText("tdd"),
    ).toBeInTheDocument();
  });
});

describe("Deploy-state — Update target on the global target", () => {
  const GLOBAL_BEHIND = { global: globalAt("v0.3.4") };

  it("keeps the dialog open while apm runs, nothing else reachable, then states each folder", async () => {
    const update = deferred();
    stubUpdate(update.promise, {
      before: GLOBAL_BEHIND,
      after: { global: globalAt("v0.3.5") },
    });
    renderDeployState();

    const dialog = await confirmUpdate("Global");
    expect(
      await within(dialog).findByRole("button", {
        name: "Updating…",
      }),
    ).toHaveAttribute("aria-busy", "true");
    for (const button of screen.queryAllByRole("button")) {
      expect(dialog).toContainElement(button);
    }

    update.resolve(
      jsonResponse({
        release: "v0.3.5",
        folders: foldersAt("v0.3.5", [{ name: "tdd", outcome: "written" }]),
      }),
    );
    expect(
      await within(dialog).findByRole("heading", {
        level: 3,
        name: "Updated to v0.3.5",
      }),
    ).toBeInTheDocument();
    expect(writtenToLines(dialog)).toEqual([
      "✓~/.claude/skillsAt v0.3.5",
      "–~/.agents/skillsCodex not detected · not written",
    ]);
    expect(
      within(dialog).queryByRole("button", { name: "Retry update" }),
    ).toBeNull();
  });

  // #1776: the Report keeps the preview's groups, so nothing unchanged reads as updated.
  it("lists the skills as Changed, Removed by this release and a folded Unchanged", async () => {
    stubUpdate(
      Promise.resolve(
        jsonResponse({
          release: "v0.3.5",
          folders: foldersAt("v0.3.5", [
            { name: "tdd", outcome: "written" },
            { name: "grill", outcome: "written" },
          ]),
        }),
      ),
      { before: GLOBAL_BEHIND, after: { global: globalAt("v0.3.5") } },
      undefined,
      {
        ...PREVIEW,
        counts: { changed: 1, removed: 1, unchanged: 1 },
        removed: ["review"],
        unchanged: ["grill"],
        selection: {
          current: ["tdd", "grill", "review"],
          desired: ["tdd", "grill"],
        },
      },
    );
    renderDeployState();

    const dialog = await confirmUpdate("Global");
    await within(dialog).findByRole("heading", {
      level: 3,
      name: "Updated to v0.3.5",
    });

    expect(
      within(dialog)
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual([
      "Updated to v0.3.5",
      "Changed",
      "Removed by this release",
      "Unchanged (1)",
    ]);
    expect(within(dialog).queryByText("Updated")).toBeNull();
    expect(
      within(dialog).getByText("Unchanged (1)").closest("details"),
    ).not.toHaveAttribute("open");
  });

  it("labels Update target by Global, the one target every folder follows", async () => {
    stubServer(() => ({ global: globalAt("v0.3.4", ["claude", "codex"]) }));
    renderDeployState();

    const pane = await openPane("Global");
    expect(
      within(pane).getByRole("button", { name: "Update target Global" }),
    ).toBeInTheDocument();
  });

  it("opens Update Global listing the folders the read names under Writes to", async () => {
    stubUpdate(Promise.resolve(jsonResponse({})), {
      before: { global: globalAt("v0.3.4", ["claude"]) },
      after: { global: globalAt("v0.3.4", ["claude"]) },
    });
    renderDeployState();

    const pane = await openPane("Global");
    await userEvent.click(
      within(pane).getByRole("button", { name: /^Update target/ }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Update Global" });
    const writesTo = await within(dialog).findByRole("group", {
      name: "Writes to",
    });
    const [claude, codex] = within(writesTo).getAllByRole("listitem");
    expect(claude).toHaveTextContent(/^~\/\.claude\/skills$/);
    expect(codex).toHaveTextContent("~/.agents/skills");
    expect(codex).toHaveTextContent("Codex not detected · not written");
  });

  it("names the folder an incomplete update left behind and puts Retry update in the footer", async () => {
    const update = deferred();
    stubUpdate(update.promise, {
      before: GLOBAL_BEHIND,
      after: {
        global: {
          ...globalAt("v0.3.4"),
          skipped: [],
          pendingOperation: PENDING,
        },
      },
    });
    renderDeployState();

    const dialog = await confirmUpdate("Global");
    await within(dialog).findByRole("button", { name: "Updating…" });
    update.resolve(
      jsonResponse(
        {
          error: "update-incomplete",
          message: "irrelevant",
          folders: foldersAt(
            "v0.3.5",
            [{ name: "tdd", outcome: "written" }],
            [{ name: "tdd", outcome: "not-updated", stillAt: "v0.3.4" }],
          ),
        },
        502,
      ),
    );

    await within(dialog).findByRole("heading", {
      level: 3,
      name: "Not every skill reached v0.3.5",
    });
    expect(writtenToLines(dialog)).toEqual([
      "✓~/.claude/skillsAt v0.3.5",
      "✕~/.agents/skills1 skill not updated" +
        "Not updatedtdd · still at v0.3.4" +
        "Select Retry update to run the same release again.",
    ]);
    expect(within(dialog).queryByText("Update incomplete")).toBeNull();
    expect(within(dialog).queryByText(/in Codex/)).toBeNull();
    expect(within(dialog).queryByRole("alert")).toBeNull();
    expect(
      within(dialog).getByRole("button", { name: "Retry update" }),
    ).toBeInTheDocument();
  });

  it("states the folders again once Retry update completes", async () => {
    const update = deferred();
    stubUpdate(
      update.promise,
      {
        before: GLOBAL_BEHIND,
        after: {
          global: {
            ...globalAt("v0.3.4"),
            skipped: [],
            pendingOperation: PENDING,
          },
        },
      },
      () =>
        jsonResponse({
          completed: PENDING,
          outcome: foldersAt("v0.3.5", [{ name: "tdd", outcome: "written" }]),
        }),
    );
    renderDeployState();

    const dialog = await confirmUpdate("Global");
    update.resolve(
      jsonResponse(
        {
          error: "update-incomplete",
          message: "irrelevant",
          folders: foldersAt("v0.3.5", [{ name: "tdd", outcome: "missing" }]),
        },
        502,
      ),
    );
    await userEvent.click(
      await within(dialog).findByRole("button", { name: "Retry update" }),
    );

    expect(
      await within(dialog).findByRole("heading", {
        level: 3,
        name: "Updated to v0.3.5",
      }),
    ).toBeInTheDocument();
    expect(writtenToLines(dialog)[0]).toBe("✓~/.claude/skillsAt v0.3.5");
    expect(
      within(dialog).queryByRole("button", { name: "Retry update" }),
    ).toBeNull();
  });

  it("states an unconfirmed update and reads every folder Not confirmed", async () => {
    stubUpdate(
      Promise.resolve(
        jsonResponse({ error: "update-failed", message: "irrelevant" }, 502),
      ),
      {
        before: { global: globalAt("v0.3.4", ["claude", "codex"]) },
        after: { global: globalAt("v0.3.4", ["claude", "codex"]) },
      },
    );
    renderDeployState();

    const dialog = await confirmUpdate("Global");

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Update outcome unknown" +
        "Maestro could not confirm that the update finished." +
        "Some folders may have changed. Check them on the Deploy-state screen, then select Update target again.",
    );
    expect(writtenToLines(dialog)).toEqual([
      "?~/.claude/skillsNot confirmed",
      "?~/.agents/skillsNot confirmed",
    ]);
    expect(within(dialog).queryByRole("heading", { level: 3 })).toBeNull();
    expect(
      within(dialog).queryByRole("button", { name: "Retry update" }),
    ).toBeNull();
  });

  it("states a failed Retry update in the dialog, in place of Update incomplete", async () => {
    const update = deferred();
    stubUpdate(
      update.promise,
      {
        before: GLOBAL_BEHIND,
        after: {
          global: {
            ...globalAt("v0.3.4"),
            skipped: [],
            pendingOperation: PENDING,
          },
        },
      },
      () => jsonResponse({ error: "retry-failed", message: "irrelevant" }, 502),
    );
    renderDeployState();

    const dialog = await confirmUpdate("Global");
    update.resolve(
      jsonResponse(
        {
          error: "update-incomplete",
          message: "irrelevant",
          folders: foldersAt("v0.3.5", [
            { name: "tdd", outcome: "not-updated", stillAt: "v0.3.4" },
          ]),
        },
        502,
      ),
    );
    await userEvent.click(
      await within(dialog).findByRole("button", { name: "Retry update" }),
    );

    const notice = await within(dialog).findByRole("alert");
    expect(
      within(notice).getByText("Update outcome unknown"),
    ).toBeInTheDocument();
    expect(
      within(notice).getByText(
        "Nothing proved the update finished. Select Retry update to run it again.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Retry update" }),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText("Update incomplete")).toBeNull();
  });

  it("names a folder's missing copy and offers Retry update", async () => {
    const update = deferred();
    stubUpdate(update.promise, {
      before: GLOBAL_BEHIND,
      after: {
        global: {
          ...globalAt("v0.3.4"),
          skipped: [],
          pendingOperation: PENDING,
        },
      },
    });
    renderDeployState();

    const dialog = await confirmUpdate("Global");
    await within(dialog).findByRole("button", { name: "Updating…" });
    update.resolve(
      jsonResponse(
        {
          error: "update-incomplete",
          message: "irrelevant",
          folders: foldersAt(
            "v0.3.5",
            [{ name: "tdd", outcome: "missing" }],
            [{ name: "tdd", outcome: "written" }],
          ),
        },
        502,
      ),
    );

    await within(dialog).findByRole("group", { name: "Written to" });
    expect(writtenToLines(dialog)).toEqual([
      "✕~/.claude/skills1 skill missing" +
        "Missingtdd" +
        "Select Retry update to run the same release again.",
      "✓~/.agents/skillsAt v0.3.5",
    ]);
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
          ...globalAt("v0.3.4"),
          skipped: [],
          pendingOperation: PENDING,
        },
      },
      after: { global: globalAt("v0.3.5") },
    });
    renderDeployState();

    const dialog = await confirmUpdate("Global");
    await within(dialog).findByRole("button", { name: "Updating…" });
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await within(
      screen.getByRole("grid", { name: "Deploy-state table", hidden: true }),
    ).findAllByText("Update incomplete");

    expect(dialog).toBeInTheDocument();
    for (const button of screen.queryAllByRole("button")) {
      expect(dialog).toContainElement(button);
    }
    update.resolve(
      jsonResponse({
        release: "v0.3.5",
        folders: foldersAt("v0.3.5", [{ name: "tdd", outcome: "written" }]),
      }),
    );
    expect(
      await within(dialog).findByRole("heading", {
        level: 3,
        name: "Updated to v0.3.5",
      }),
    ).toBeInTheDocument();
    expect(
      within(skillSection(dialog, "Changed")).getByText("tdd"),
    ).toBeInTheDocument();
  });
});
