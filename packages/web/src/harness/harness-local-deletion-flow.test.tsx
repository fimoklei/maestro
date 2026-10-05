import type { HarnessState } from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { sentence } from "../test-utils";
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
        folderOnDisk: true,
      }),
      row("pending-proposal", "code-review", "not-yet-proposed"),
    ],
  });

  // The folder as the dialog's check reads it.
  const checked = (workingTree: string) => ({
    body: {
      skills: {
        "old-skill": {
          inClone: true,
          workingTree,
          uncommitted: true,
          localOnly: true,
        },
      },
    },
  });
  const CLEAN = [checked("tree-1")];

  const confirmButton = (dialog: HTMLElement) =>
    within(dialog).getByRole("button", { name: /^delete skill/i });

  const checkedOpen = async () => {
    const dialog = await openLocalDeletion();
    await waitFor(() =>
      expect(confirmButton(dialog)).not.toHaveAttribute("aria-disabled"),
    );
    return dialog;
  };

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
      deletionChecks: CLEAN,
      localDeletions,
    });
    renderHarness();

    const dialog = await openLocalDeletion();

    expect(
      within(dialog).getByText(
        sentence(
          "Delete skill removes the folder from disk. No other copy of old-skill exists.",
        ),
      ),
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
      deletionChecks: CLEAN,
      localDeletions,
      deletions,
      promotions,
    });
    renderHarness();
    const dialog = await checkedOpen();

    await userEvent.click(confirmButton(dialog));

    await waitFor(() =>
      expect(localDeletions).toEqual([
        { name: "old-skill", seenWorkingTree: "tree-1" },
      ]),
    );
    // Neither push route was taken: this deletion never reaches GitHub.
    expect(deletions).toEqual([]);
    expect(promotions).toEqual([]);
    await waitFor(() => expect(screen.queryByText("old-skill")).toBeNull());
  });

  it("states a refusal in the dialog, and leaves the skill in place", async () => {
    stubHarnessServer({
      read: { body: LOCAL_ONLY },
      localDeletion: { body: { error: "destination-unsafe" }, status: 409 },
      deletionChecks: CLEAN,
    });
    renderHarness();
    const dialog = await checkedOpen();
    const confirm = confirmButton(dialog);

    await userEvent.click(confirm);

    expect(
      await within(dialog).findByText(/Folder outside the Harness/i),
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
      deletionChecks: CLEAN,
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

  it("keeps Delete skill unavailable while the check reads the folder", async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const localDeletions: Record<string, unknown>[] = [];
    stubHarnessServer({
      read: { body: LOCAL_ONLY },
      localDeletion: { body: { name: "old-skill" } },
      localDeletions,
      deletionChecks: [{ ...checked("tree-1"), heldUntil: held }],
    });
    renderHarness();
    const dialog = await openLocalDeletion();

    expect(
      within(dialog).getByText("Checking for uncommitted changes…"),
    ).toBeInTheDocument();
    await userEvent.click(confirmButton(dialog));
    expect(localDeletions).toEqual([]);

    release();
    await waitFor(() =>
      expect(
        within(dialog).queryByText("Checking for uncommitted changes…"),
      ).toBeNull(),
    );
    expect(confirmButton(dialog)).not.toHaveAttribute("aria-disabled");
  });

  it("states that the clone was not read when the check fails, and deletes nothing", async () => {
    const localDeletions: Record<string, unknown>[] = [];
    stubHarnessServer({
      read: { body: LOCAL_ONLY },
      localDeletion: { body: { name: "old-skill" } },
      localDeletions,
      deletionChecks: [{ body: { error: "no-answer" }, status: 409 }],
    });
    renderHarness();
    const dialog = await openLocalDeletion();

    expect(await within(dialog).findByText("Clone not read")).toBeVisible();
    expect(
      within(dialog).getByText("Git could not read your clone."),
    ).toBeInTheDocument();
    await userEvent.click(confirmButton(dialog));
    expect(localDeletions).toEqual([]);
  });

  it("reads the folder again after it changed under the dialog, and confirms against the new reading", async () => {
    const localDeletions: Record<string, unknown>[] = [];
    stubHarnessServer({
      read: { body: LOCAL_ONLY },
      localDeletion: {
        body: { error: "confirmation-stale" },
        status: 409,
        retry: { body: { name: "old-skill" } },
      },
      localDeletions,
      deletionChecks: [checked("tree-1"), checked("tree-2")],
    });
    renderHarness();
    const dialog = await checkedOpen();

    await userEvent.click(confirmButton(dialog));

    expect(
      await within(dialog).findByText("Confirmation out of date"),
    ).toBeVisible();
    expect(
      within(dialog).getByText(
        sentence("The old-skill folder changed after this dialog opened."),
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(confirmButton(dialog)).not.toHaveAttribute("aria-disabled"),
    );
    await userEvent.click(confirmButton(dialog));
    await waitFor(() =>
      expect(localDeletions).toEqual([
        { name: "old-skill", seenWorkingTree: "tree-1" },
        { name: "old-skill", seenWorkingTree: "tree-2" },
      ]),
    );
  });
});

// Step 1 of deleting a skill on the default branch (#1370): the folder leaves
// the clone, and the row turns into the deletion Propose change carries on.
describe("Harness step 1 of deleting a skill on the default branch", () => {
  const EDITED = row("pending-proposal", "jobs", "not-yet-proposed", {
    remoteTree: "remote-jobs",
    folderOnDisk: true,
  });

  const DELETED = withStages(ON_DISK, {
    proposal: [
      row("pending-proposal", "jobs", "deleted-locally", {
        deletion: true,
        remoteTree: "remote-jobs",
        restorable: true,
      }),
    ],
  });

  const checked = (uncommitted: boolean) => [
    {
      body: {
        skills: {
          jobs: {
            inClone: true,
            workingTree: "tree-1",
            uncommitted,
            localOnly: false,
          },
        },
      },
    },
  ];

  const openStepOne = async (stage?: string) => {
    const menu = await openRowMenu("jobs", stage);
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: /^delete skill$/i }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: /delete jobs/i,
    });
    await waitFor(() =>
      expect(
        within(dialog).getByRole("button", { name: /^delete skill/i }),
      ).not.toHaveAttribute("aria-disabled"),
    );
    return dialog;
  };

  it("opens step 1 from a Pending proposal row, warning of uncommitted changes", async () => {
    stubHarnessServer({
      read: { body: withStages(ON_DISK, { proposal: [EDITED] }) },
      deletionChecks: checked(true),
    });
    renderHarness();

    const dialog = await openStepOne();

    expect(
      within(dialog).getByText(
        sentence(
          "Delete skill removes the jobs folder from your clone of fimoklei/agent-harness. The skill stays in fimoklei/agent-harness and in your targets.",
        ),
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(sentence("Uncommitted changes in jobs")),
    ).toBeInTheDocument();
  });

  it("warns of nothing for a clean folder", async () => {
    stubHarnessServer({
      read: { body: withStages(ON_DISK, { proposal: [EDITED] }) },
      deletionChecks: checked(false),
    });
    renderHarness();

    const dialog = await openStepOne();

    expect(
      within(dialog).queryByText("Uncommitted changes in jobs"),
    ).toBeNull();
  });

  it("turns the row into Deleted locally in place, with Restore skill on it", async () => {
    const localDeletions: Record<string, unknown>[] = [];
    const deletions: Record<string, unknown>[] = [];
    stubHarnessServer({
      read: {
        body: withStages(ON_DISK, { proposal: [EDITED] }),
        afterPromote: DELETED,
      },
      deletionChecks: checked(false),
      localDeletion: { body: { name: "jobs" } },
      localDeletions,
      deletions,
    });
    renderHarness();
    const dialog = await openStepOne();

    await userEvent.click(
      within(dialog).getByRole("button", { name: /^delete skill/i }),
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(localDeletions).toEqual([
      { name: "jobs", seenWorkingTree: "tree-1" },
    ]);
    // Step 2 waits for its own press.
    expect(deletions).toEqual([]);
    expect(await screen.findByText("Deleted locally")).toBeVisible();
    const menu = await openRowMenu("jobs");
    expect(
      within(menu).getByRole("menuitem", { name: /^restore skill$/i }),
    ).toBeInTheDocument();
  });

  it("opens step 1 from a Pending release row with no proposal row", async () => {
    stubHarnessServer({
      read: {
        body: withStages(ON_DISK, {
          release: [
            row("pending-release", "jobs", "changed", { folderOnDisk: true }),
          ],
        }),
      },
      deletionChecks: checked(false),
    });
    renderHarness();

    const dialog = await openStepOne("Pending release");

    expect(
      within(dialog).getByText(
        sentence(
          "To also delete it from fimoklei/agent-harness, select Propose change.",
        ),
      ),
    ).toBeInTheDocument();
  });
});
