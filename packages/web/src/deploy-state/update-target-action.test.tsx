import type { UpdatePreview } from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { ScreenWritesContext } from "../ui/use-write-action";
import { UpdateTargetAction } from "./update-target-action";

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

function Host() {
  const [open, setOpen] = useState(false);
  return (
    <ScreenWritesContext.Provider
      value={{ report: () => {}, settle: () => {} }}
    >
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open ? (
        <UpdateTargetAction
          targetName="project"
          target={{ kind: "repo", repoPath: "/Users/me/project" }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </ScreenWritesContext.Provider>
  );
}

describe("UpdateTargetAction", () => {
  it("starts each mount without the failure of the update before it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/deploy/update/preflight") {
          return jsonResponse({ preview: PREVIEW });
        }
        if (url === "/api/deploy/update") {
          return jsonResponse({ error: "status-out-of-date" }, 409);
        }
        throw new Error(`unexpected request ${url}`);
      }),
    );
    renderWithQuery(<Host />);

    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    const first = await screen.findByRole("dialog");
    await userEvent.click(
      await within(first).findByRole("button", { name: "Update target" }),
    );
    await within(first).findByRole("alert");
    await userEvent.click(
      within(first)
        .getAllByRole("button", { name: "Close" })
        .at(-1) as HTMLElement,
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    const again = await screen.findByRole("dialog");

    expect(
      await within(again).findByRole("button", { name: "Update target" }),
    ).toBeInTheDocument();
    expect(within(again).queryByRole("alert")).toBeNull();
  });
});
