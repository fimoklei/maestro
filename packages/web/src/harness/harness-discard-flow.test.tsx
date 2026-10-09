import type { HarnessState } from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { sentence } from "../test-utils";
import {
  harnessRegion,
  installHarnessHooks,
  ON_DISK,
  openPane,
  openRowMenu,
  renderHarness,
  row,
  stubHarnessServer,
  withStages,
} from "./harness-flow-fixture";

installHarnessHooks();

describe("Harness discard", () => {
  // An edit to a skill the default branch holds, never proposed (#1375).
  const EDITED: HarnessState = withStages(ON_DISK, {
    proposal: [
      row("pending-proposal", "code-review", "not-yet-proposed", {
        remoteTree: "remote-code-review",
        folderOnDisk: true,
      }),
    ],
  });

  const GONE: HarnessState = withStages(ON_DISK, { proposal: [] });

  const openDiscard = async () => {
    const menu = await openRowMenu("code-review");
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: /^discard change$/i }),
    );
    return screen.findByRole("dialog", {
      name: "Discard change for code-review",
    });
  };

  it("names Discard change in the row's detail sentence", async () => {
    stubHarnessServer({ read: { body: EDITED } });
    renderHarness();

    const pane = await openPane("code-review");
    expect(
      within(pane).getByText(
        sentence(
          "Your local copy differs from main. Select Propose change to send it for review, or select Discard change to match main again.",
        ),
      ),
    ).toBeInTheDocument();
  });

  it("discards nothing until the dialog is confirmed", async () => {
    const discards: Record<string, unknown>[] = [];
    stubHarnessServer({
      read: { body: EDITED },
      discard: { body: { name: "code-review" } },
      discards,
    });
    renderHarness();

    const dialog = await openDiscard();

    expect(within(dialog).getByText(".apm/skills/code-review")).toBeVisible();
    expect(within(dialog).getByText("main", { selector: "dd" })).toBeVisible();
    expect(discards).toEqual([]);
  });

  it("sends the tree the row was read against, and the row leaves Pending proposal", async () => {
    const discards: Record<string, unknown>[] = [];
    const promotions: Record<string, unknown>[] = [];
    stubHarnessServer({
      read: { body: EDITED, afterPromote: GONE },
      discard: { body: { name: "code-review" } },
      discards,
      promotions,
    });
    renderHarness();
    const dialog = await openDiscard();

    await userEvent.click(
      within(dialog).getByRole("button", { name: /^discard change$/i }),
    );

    await waitFor(() =>
      expect(discards).toEqual([
        { name: "code-review", seenRemoteTree: "remote-code-review" },
      ]),
    );
    expect(promotions).toEqual([]);
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /discard change/i }),
      ).toBeNull(),
    );
    await waitFor(() =>
      expect(harnessRegion()).toHaveTextContent(
        "Pending proposal has no changes.",
      ),
    );
    expect(screen.queryByText("code-review")).toBeNull();
  });

  it("states a refusal in the dialog and keeps the confirmation standing", async () => {
    stubHarnessServer({
      read: { body: EDITED },
      discard: { body: { error: "already-proposed" }, status: 409 },
    });
    renderHarness();
    const dialog = await openDiscard();

    await userEvent.click(
      within(dialog).getByRole("button", { name: /^discard change$/i }),
    );

    expect(
      await within(dialog).findByText("Change already proposed"),
    ).toBeVisible();
    expect(
      within(dialog).getByText(
        sentence("code-review now has a proposal branch or pull request."),
      ),
    ).toBeVisible();
  });
});
