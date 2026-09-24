import type { HarnessState } from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  installHarnessHooks,
  ON_DISK,
  openRowMenu,
  renderHarness,
  row,
  stubHarnessServer,
  withStages,
} from "./harness-flow-fixture";

installHarnessHooks();

describe("Harness local deletion", () => {
  // The other road out of the same dialog: a skill that exists nowhere else
  // has no deletion to propose, so the folder goes from disk (#798).
  const LOCAL_ONLY: HarnessState = withStages(ON_DISK, {
    proposal: [
      row("pending-proposal", "old-skill", "not-yet-proposed", {
        localOnly: true,
      }),
      row("pending-proposal", "code-review", "not-yet-proposed"),
    ],
  });

  const openLocalDeletion = async () => {
    const menu = await openRowMenu("old-skill");
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: /^delete skill$/i }),
    );
    return screen.findByRole("dialog", { name: /delete old-skill/i });
  };

  it("offers Delete skill only on the row whose skill exists nowhere else", async () => {
    stubHarnessServer({ read: { body: LOCAL_ONLY } });
    renderHarness();

    const menu = await openRowMenu("code-review");

    expect(
      within(menu).queryByRole("menuitem", { name: /^delete skill$/i }),
    ).toBeNull();
  });

  it("states that the skill exists nowhere else, and deletes nothing until it is confirmed", async () => {
    const localDeletions: Record<string, unknown>[] = [];
    stubHarnessServer({
      read: { body: LOCAL_ONLY },
      localDeletion: { body: { name: "old-skill" } },
      localDeletions,
    });
    renderHarness();

    const dialog = await openLocalDeletion();

    expect(
      within(dialog).getByText(/nowhere else\. Confirming removes the folder/i),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(".apm/skills/old-skill")).toBeVisible();
    expect(localDeletions).toEqual([]);
  });

  it("removes the folder and refreshes the view so the row is gone", async () => {
    const localDeletions: Record<string, unknown>[] = [];
    const deletions: Record<string, unknown>[] = [];
    const promotions: Record<string, unknown>[] = [];
    stubHarnessServer({
      read: {
        body: LOCAL_ONLY,
        afterPromote: withStages(ON_DISK, {
          proposal: [
            row("pending-proposal", "code-review", "not-yet-proposed"),
          ],
        }),
      },
      localDeletion: { body: { name: "old-skill" } },
      localDeletions,
      deletions,
      promotions,
    });
    renderHarness();
    const dialog = await openLocalDeletion();

    await userEvent.click(
      within(dialog).getByRole("button", { name: /^delete skill$/i }),
    );

    await waitFor(() =>
      expect(localDeletions).toEqual([{ name: "old-skill" }]),
    );
    // Neither push route was taken: this deletion never reaches GitHub.
    expect(deletions).toEqual([]);
    expect(promotions).toEqual([]);
    await waitFor(() => expect(screen.queryByText("old-skill")).toBeNull());
  });

  it("states a refusal in the dialog, and leaves the skill in place", async () => {
    stubHarnessServer({
      read: { body: LOCAL_ONLY },
      localDeletion: { body: { error: "not-local-only" }, status: 409 },
    });
    renderHarness();
    const dialog = await openLocalDeletion();
    const confirm = within(dialog).getByRole("button", {
      name: /^delete skill$/i,
    });

    await userEvent.click(confirm);

    expect(
      await within(dialog).findByText(/Skill exists elsewhere/i),
    ).toBeInTheDocument();
    expect(confirm).toBeEnabled();
    // Still on the board behind the dialog: a refusal removed nothing.
    expect(screen.getAllByText("old-skill").length).toBeGreaterThan(0);
  });

  it("deletes nothing when the confirmation is dismissed", async () => {
    const localDeletions: Record<string, unknown>[] = [];
    stubHarnessServer({
      read: { body: LOCAL_ONLY },
      localDeletion: { body: { name: "old-skill" } },
      localDeletions,
    });
    renderHarness();
    const dialog = await openLocalDeletion();

    await userEvent.click(
      within(dialog).getByRole("button", { name: /^cancel$/i }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /delete old-skill/i }),
      ).toBeNull(),
    );
    expect(localDeletions).toEqual([]);
    expect(screen.getByText("old-skill")).toBeVisible();
  });
});
