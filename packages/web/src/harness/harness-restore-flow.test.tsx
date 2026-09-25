import type { HarnessState } from "@maestro/core";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  installHarnessHooks,
  ON_DISK,
  openPane,
  openRowMenu,
  renderHarness,
  row,
  stubHarnessServer,
  withStages,
} from "./harness-flow-fixture";
import { pullRequest } from "./stage-row-fixture";

installHarnessHooks();

describe("Harness restore", () => {
  // Putting a deleted folder back from the clone's own last commit. Nothing
  // here reaches GitHub, so nothing GitHub says may take the way back (#915).
  const DELETED_ROW: HarnessState = withStages(ON_DISK, {
    proposal: [
      row("pending-proposal", "old-skill", "deleted-locally", {
        deletion: true,
        restorable: true,
      }),
      row("pending-proposal", "code-review", "not-yet-proposed"),
    ],
  });

  const BACK: HarnessState = withStages(ON_DISK, {
    proposal: [row("pending-proposal", "code-review", "not-yet-proposed")],
  });

  const openRestore = async (stage = "Pending proposal") => {
    const menu = await openRowMenu("old-skill", stage);
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: /^restore skill$/i }),
    );
    return screen.findByRole("dialog", { name: /restore old-skill/i });
  };

  it("offers Restore skill last, and only where the folder can come back", async () => {
    stubHarnessServer({ read: { body: DELETED_ROW } });
    renderHarness();

    const menu = await openRowMenu("old-skill");
    const items = within(menu)
      .getAllByRole("menuitem")
      .map((item) => item.textContent);
    // One menu at a time: the first has to go before the next row's opens.
    await userEvent.keyboard("{Escape}");
    const other = await openRowMenu("code-review");

    expect(items.at(-1)).toBe("Restore skill");
    expect(
      within(other).queryByRole("menuitem", { name: /^restore skill$/i }),
    ).toBeNull();
  });

  // The row a restore is pressed from can sit in either local stage, so the
  // view looks the skill up across both rather than in Pending proposal alone.
  it("offers the same press from a Pending review row", async () => {
    stubHarnessServer({
      read: {
        body: withStages(ON_DISK, {
          review: [
            row("pending-review", "old-skill", "waiting-for-review", {
              deletion: true,
              restorable: true,
              requests: [pullRequest(45)],
            }),
          ],
        }),
      },
    });
    renderHarness();

    const dialog = await openRestore("Pending review");

    expect(dialog).toBeInTheDocument();
  });

  it("closes on Escape while nothing is pending", async () => {
    stubHarnessServer({ read: { body: DELETED_ROW } });
    renderHarness();
    await openRestore();

    await userEvent.keyboard("{Escape}");

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /restore old-skill/i }),
      ).toBeNull(),
    );
  });

  it("keeps Restore skill open while the remote gave no answer", async () => {
    stubHarnessServer({
      read: {
        body: {
          ...DELETED_ROW,
          freshness: { outcome: "offline", lastFetchedAt: null },
        },
      },
      refresh: { body: {}, rejects: true },
    });
    renderHarness();

    const menu = await openRowMenu("old-skill");

    // The remote-backed press is closed; the local one is not.
    expect(
      within(menu).getByRole("menuitem", { name: /^propose change$/i }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      within(menu).getByRole("menuitem", { name: /^restore skill$/i }),
    ).not.toHaveAttribute("aria-disabled", "true");
  });

  it("names the row's two ways on in its detail sentence", async () => {
    stubHarnessServer({ read: { body: DELETED_ROW } });
    renderHarness();

    const pane = await openPane("old-skill");
    expect(
      within(pane).getByText(
        "This skill is deleted in your clone but still on main. Select Propose change to propose the deletion, or Restore skill to bring it back.",
      ),
    ).toBeInTheDocument();
  });

  it("states what the restore takes and restores nothing until it is confirmed", async () => {
    const restores: Record<string, unknown>[] = [];
    stubHarnessServer({
      read: { body: DELETED_ROW },
      restore: { body: { name: "old-skill", commit: "local-head" } },
      restores,
    });
    renderHarness();

    const dialog = await openRestore();

    expect(
      within(dialog).getByText(
        "Restore this skill folder from your last local commit. Changes not included in that commit will not be recovered.",
      ),
    ).toBeVisible();
    expect(within(dialog).getByText(".apm/skills/old-skill")).toBeVisible();
    expect(within(dialog).getByText("local-head")).toBeVisible();
    expect(restores).toEqual([]);
  });

  it("restores the folder from the commit the dialog named and says so", async () => {
    const restores: Record<string, unknown>[] = [];
    const promotions: Record<string, unknown>[] = [];
    stubHarnessServer({
      read: { body: DELETED_ROW, afterPromote: BACK },
      restore: { body: { name: "old-skill", commit: "local-head" } },
      restores,
      promotions,
    });
    renderHarness();
    const dialog = await openRestore();

    await userEvent.click(
      within(dialog).getByRole("button", { name: /^restore skill$/i }),
    );

    await waitFor(() =>
      expect(restores).toEqual([
        { name: "old-skill", seenHeadCommit: "local-head" },
      ]),
    );
    // Nothing was pushed: the commit it came from is already in the clone.
    expect(promotions).toEqual([]);
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /restore old-skill/i }),
      ).toBeNull(),
    );
    expect(await screen.findByText("Skill restored")).toBeInTheDocument();
    expect(
      screen.getByText("Restored from your last local commit."),
    ).toBeInTheDocument();
  });

  // The dialog promises that a moved commit restores nothing, and only the
  // server can keep that promise: it compares the commit the confirmation
  // carries against a fresh HEAD. A check that runs while the confirmation is
  // open must therefore not rewrite what it carries (ADR-0030).
  it("carries the commit it opened with after a later check moved the picture", async () => {
    const restores: Record<string, unknown>[] = [];
    stubHarnessServer({
      read: { body: DELETED_ROW },
      refresh: {
        body: DELETED_ROW,
        // A newer commit, and the row the press was made on gone from the read.
        retry: {
          body: {
            ...withStages(ON_DISK, {
              proposal: [
                row("pending-proposal", "later-skill", "not-yet-proposed"),
              ],
            }),
            localHeadCommit: "moved-head",
          },
        },
      },
      restore: { body: { name: "old-skill", commit: "local-head" } },
      restores,
    });
    renderHarness();
    const dialog = await openRestore();

    // Behind the open dialog, so it is reached the way the check would be
    // reached if the reader had pressed it before opening the confirmation.
    fireEvent.click(
      screen.getByRole("button", { name: "Re-read Harness", hidden: true }),
    );
    // The read landed, and the confirmation it moved under still stands.
    expect(await screen.findByText("later-skill")).toBeVisible();
    await userEvent.click(
      within(dialog).getByRole("button", { name: /^restore skill$/i }),
    );

    await waitFor(() =>
      expect(restores).toEqual([
        { name: "old-skill", seenHeadCommit: "local-head" },
      ]),
    );
  });

  it("says the open proposal is untouched, in the dialog and after it", async () => {
    const proposed = withStages(ON_DISK, {
      proposal: [
        row("pending-proposal", "old-skill", "deleted-locally", {
          deletion: true,
          restorable: true,
          requests: [pullRequest(45)],
        }),
      ],
    });
    stubHarnessServer({
      read: { body: proposed, afterPromote: BACK },
      restore: { body: { name: "old-skill", commit: "local-head" } },
    });
    renderHarness();
    const dialog = await openRestore();

    expect(
      within(dialog).getByText("Your proposal remains unchanged."),
    ).toBeVisible();

    await userEvent.click(
      within(dialog).getByRole("button", { name: /^restore skill$/i }),
    );

    expect(await screen.findByText("Skill restored")).toBeInTheDocument();
    expect(
      await screen.findByText("Your proposal remains unchanged."),
    ).toBeInTheDocument();
  });

  // The folder is back whatever GitHub answered afterwards, so the heading
  // holds and only the status is called out of date.
  it("warns instead of claiming a verified status when GitHub could not be read again", async () => {
    stubHarnessServer({
      read: {
        body: DELETED_ROW,
        afterPromote: {
          ...BACK,
          stages: { ...BACK.stages, review: { outcome: "unavailable" } },
        },
      },
      restore: { body: { name: "old-skill", commit: "local-head" } },
    });
    renderHarness();
    const dialog = await openRestore();

    await userEvent.click(
      within(dialog).getByRole("button", { name: /^restore skill$/i }),
    );

    expect(await screen.findByText("Skill restored")).toBeInTheDocument();
    expect(
      await screen.findByText(
        "The skill folder is back, but the status is out of date. Select Re-read Harness to read GitHub again.",
      ),
    ).toBeInTheDocument();
  });

  it("states a refusal in the dialog, and leaves the row as it was", async () => {
    stubHarnessServer({
      read: { body: DELETED_ROW },
      restore: { body: { error: "staged-changes" }, status: 409 },
    });
    renderHarness();
    const dialog = await openRestore();
    const confirm = within(dialog).getByRole("button", {
      name: /^restore skill$/i,
    });

    await userEvent.click(confirm);

    expect(
      await within(dialog).findByText("Skill has staged changes"),
    ).toBeInTheDocument();
    expect(confirm).toBeEnabled();
    expect(screen.queryByText("Skill restored")).toBeNull();
  });

  it("restores nothing when the confirmation is dismissed", async () => {
    const restores: Record<string, unknown>[] = [];
    stubHarnessServer({
      read: { body: DELETED_ROW },
      restore: { body: { name: "old-skill", commit: "local-head" } },
      restores,
    });
    renderHarness();
    const dialog = await openRestore();

    await userEvent.click(
      within(dialog).getByRole("button", { name: /^cancel$/i }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /restore old-skill/i }),
      ).toBeNull(),
    );
    expect(restores).toEqual([]);
    expect(screen.getAllByText("old-skill").length).toBeGreaterThan(0);
  });
});
