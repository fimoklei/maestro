import type { UpdatePreview } from "@maestro/core";
import { focusManager } from "@tanstack/react-query";
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { GlobalDeployStatePanel } from "./global-deploy-state-panel";

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

const toolAt = (release: string) => ({
  tool: "claude",
  primitives: [{ type: "skill", name: "tdd", version: release }],
  releaseHead: {
    release,
    latestRelease: "v0.3.5",
    changed: release === "v0.3.5" ? 0 : 1,
    changedSkills: release === "v0.3.5" ? [] : ["tdd"],
    selection: ["tdd"],
    selected: 1,
    comparedAt: "2026-09-14T10:00:00.000Z",
  },
});

const BEHIND = { tools: [toolAt("v0.3.4")], skipped: [] };
// The record the update writes before its first change, readable mid-run.
const UNFINISHED = {
  tools: [toolAt("v0.3.4")],
  skipped: [],
  pendingOperation: { kind: "update", release: "v0.3.5", desired: ["tdd"] },
};

// The global state reads behind, then `during` once the update is sent, then
// `after` once it answers.
function stubUpdate(
  answer: Promise<Response>,
  { during = BEHIND, after }: { during?: object; after: object },
) {
  let updateSent = false;
  let updateAnswered = false;
  void answer.then(() => {
    updateAnswered = true;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url === "/api/deploy/update/preflight") {
        return Promise.resolve(jsonResponse({ preview: PREVIEW }));
      }
      if (url === "/api/deploy/update") {
        updateSent = true;
        return answer;
      }
      if (url === "/api/drift/global") {
        return Promise.resolve(jsonResponse({ behind: [] }));
      }
      if (url === "/api/deploy-state/global") {
        return Promise.resolve(
          jsonResponse(updateAnswered ? after : updateSent ? during : BEHIND),
        );
      }
      return Promise.reject(new Error(`unexpected request ${url}`));
    }),
  );
}

async function confirmUpdate() {
  await userEvent.click(
    await screen.findByRole("button", { name: /^Update target/ }),
  );
  const dialog = await screen.findByRole("dialog");
  await userEvent.click(
    await within(dialog).findByRole("button", { name: "Update target" }),
  );
  return dialog;
}

describe("GlobalDeployStatePanel Update target", () => {
  it("keeps the dialog open while apm runs and then lists what landed", async () => {
    let resolveUpdate: (response: Response) => void = () => {};
    stubUpdate(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
      { after: { tools: [toolAt("v0.3.5")], skipped: [] } },
    );
    renderWithQuery(<GlobalDeployStatePanel onStartDeploy={() => {}} />);

    const dialog = await confirmUpdate();

    expect(
      await within(dialog).findByRole("button", {
        name: "Updating to v0.3.5…",
      }),
    ).toBeDisabled();
    // Story 27: nothing outside the dialog starts a second operation.
    for (const button of screen.queryAllByRole("button")) {
      if (!dialog.contains(button)) {
        expect(button).toBeDisabled();
      }
    }

    resolveUpdate(
      jsonResponse({
        release: "v0.3.5",
        outcome: [{ name: "tdd", tool: null, state: "updated" }],
      }),
    );

    expect(
      await within(dialog).findByText("tdd updated to v0.3.5"),
    ).toBeInTheDocument();
  });

  it("shows an incomplete update's outcome and Retry update in the dialog", async () => {
    let resolveUpdate: (response: Response) => void = () => {};
    stubUpdate(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
      { after: UNFINISHED },
    );
    renderWithQuery(<GlobalDeployStatePanel onStartDeploy={() => {}} />);

    const dialog = await confirmUpdate();
    await within(dialog).findByRole("button", { name: "Updating to v0.3.5…" });
    resolveUpdate(
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
    let resolveUpdate: (response: Response) => void = () => {};
    stubUpdate(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
      { during: UNFINISHED, after: { tools: [toolAt("v0.3.5")], skipped: [] } },
    );
    renderWithQuery(<GlobalDeployStatePanel onStartDeploy={() => {}} />);

    const dialog = await confirmUpdate();
    await within(dialog).findByRole("button", { name: "Updating to v0.3.5…" });
    // A window focus re-reads the global state while apm still runs.
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await screen.findByText("▲ Mixed releases");

    expect(dialog).toBeInTheDocument();
    for (const button of screen.queryAllByRole("button")) {
      if (!dialog.contains(button)) {
        expect(button).toBeDisabled();
      }
    }

    resolveUpdate(
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
