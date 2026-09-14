import type { UpdatePreview } from "@maestro/core";
import { focusManager } from "@tanstack/react-query";
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { DeployStatePanel } from "./deploy-state-panel";

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

const stateAt = (release: string, pendingOperation?: object) => ({
  primitives: [{ type: "skill", name: "tdd", version: release }],
  skipped: [],
  releaseHead: {
    release,
    latestRelease: "v0.3.5",
    changed: 1,
    selected: 1,
    comparedAt: "2026-09-14T10:00:00.000Z",
  },
  ...(pendingOperation === undefined ? {} : { pendingOperation }),
});

describe("DeployStatePanel Update target", () => {
  it("keeps the dialog when a mid-run read finds the update unfinished", async () => {
    let resolveUpdate: (response: Response) => void = () => {};
    let updateSent = false;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === "/api/deploy/update/preflight") {
          return Promise.resolve(jsonResponse({ preview: PREVIEW }));
        }
        if (url === "/api/deploy/update") {
          updateSent = true;
          return new Promise((resolve) => {
            resolveUpdate = resolve;
          });
        }
        if (url.startsWith("/api/deploy-state")) {
          return Promise.resolve(
            jsonResponse(
              updateSent
                ? stateAt("v0.3.4", {
                    kind: "update",
                    release: "v0.3.5",
                    desired: ["tdd"],
                  })
                : stateAt("v0.3.4"),
            ),
          );
        }
        return Promise.resolve(jsonResponse({ behind: [] }));
      }),
    );
    renderWithQuery(
      <DeployStatePanel repo="/Users/me/project" onStartDeploy={() => {}} />,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: /^Update target/ }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      await within(dialog).findByRole("button", { name: "Update target" }),
    );
    await within(dialog).findByRole("button", { name: "Updating to v0.3.5…" });
    // A window focus re-reads the deploy-state while apm still runs.
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await screen.findByText("▲ Mixed releases");

    expect(dialog).toBeInTheDocument();

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
