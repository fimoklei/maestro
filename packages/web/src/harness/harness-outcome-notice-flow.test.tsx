import type { HarnessState } from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  installHarnessHooks,
  ON_DISK,
  openRowMenu,
  PLAN,
  renderHarness,
  row,
  stubHarnessServer,
  withStages,
} from "./harness-flow-fixture";

installHarnessHooks();

describe("Harness outcome notices", () => {
  const DELETED_ROW: HarnessState = withStages(ON_DISK, {
    proposal: [
      row("pending-proposal", "old-skill", "deleted-locally", {
        deletion: true,
        restorable: true,
      }),
    ],
  });

  // GitHub out of reach and the clone behind: two notices that both apply.
  const STALE_AND_BEHIND: HarnessState = {
    ...DELETED_ROW,
    cloneSync: "behind",
    freshness: {
      outcome: "offline",
      lastFetchedAt: ON_DISK.freshness.lastFetchedAt,
    },
  };

  // The review stage is what GitHub answered; unread, the status is unknown.
  const UNREAD_REVIEW: HarnessState = {
    ...DELETED_ROW,
    stages: { ...DELETED_ROW.stages, review: { outcome: "unavailable" } },
  };

  const restore = async () => {
    const menu = await openRowMenu("old-skill", "Pending proposal");
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: /^restore skill$/i }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: /restore old-skill/i,
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: /^restore skill$/i }),
    );
  };

  const publish = async () => {
    const release = await screen.findByRole("button", {
      name: /^create a release$/i,
    });
    await waitFor(() => expect(release).toBeEnabled());
    await userEvent.click(release);
    await screen.findByText("v1.3.0");
    await userEvent.click(
      screen.getByRole("button", { name: /^publish release$/i }),
    );
  };

  const openTimeCheckSettled = async () => {
    const [reread] = screen.getAllByRole("button", { name: "Re-read Harness" });
    await waitFor(() => expect(reread).not.toHaveAttribute("aria-busy"));
  };

  it("shows only the notice that blocks most", async () => {
    stubHarnessServer({
      read: { body: STALE_AND_BEHIND, afterWriteStatus: 500 },
      refresh: { body: STALE_AND_BEHIND, retry: { body: {}, status: 500 } },
      restore: { body: { name: "old-skill", commit: "local-head" } },
    });
    renderHarness();

    expect(await screen.findByText("Status out of date")).toBeInTheDocument();
    await openTimeCheckSettled();
    expect(screen.queryByText("Harness clone not updated")).toBeNull();

    // The restore's own read fails, and the Harness read after it too.
    await restore();

    expect(await screen.findByText("Harness not read")).toBeInTheDocument();
    expect(screen.queryByText("Status out of date")).toBeNull();
    expect(screen.queryByText("Harness clone not updated")).toBeNull();
    expect(screen.queryByText("Skill restored")).toBeNull();
  });

  it("shows the next notice once the first clears", async () => {
    stubHarnessServer({
      read: { body: STALE_AND_BEHIND },
      refresh: {
        body: STALE_AND_BEHIND,
        retry: { body: { ...STALE_AND_BEHIND, freshness: ON_DISK.freshness } },
      },
    });
    renderHarness();
    expect(await screen.findByText("Status out of date")).toBeInTheDocument();
    await openTimeCheckSettled();

    const [reread] = screen.getAllByRole("button", { name: "Re-read Harness" });
    await userEvent.click(reread as HTMLElement);

    expect(
      await screen.findByText("Harness clone not updated"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Status out of date")).toBeNull();
  });

  it("states a full restore and a full publish in a toast, not the band", async () => {
    stubHarnessServer({
      read: { body: DELETED_ROW },
      refresh: { body: DELETED_ROW },
      restore: { body: { name: "old-skill", commit: "local-head" } },
      plan: { body: PLAN },
      publish: { body: { tag: "v1.3.0", revision: PLAN.revision } },
    });
    renderHarness();

    await restore();
    expect(await screen.findByText("Restored old-skill.")).toBeInTheDocument();
    await publish();
    expect(await screen.findByText("Published v1.3.0.")).toBeInTheDocument();

    expect(screen.queryByText("Skill restored")).toBeNull();
    expect(screen.queryByText("Release published")).toBeNull();
  });

  const bandNotice = async (label: string) =>
    (await screen.findByText(label)).closest("[role]") as HTMLElement;

  it("keeps a partial restore in the band, with its action", async () => {
    stubHarnessServer({
      read: { body: DELETED_ROW },
      refresh: { body: DELETED_ROW, retry: { body: UNREAD_REVIEW } },
      restore: { body: { name: "old-skill", commit: "local-head" } },
    });
    renderHarness();

    await restore();

    const notice = await bandNotice("Skill restored");
    expect(
      within(notice).getByRole("button", { name: "Re-read Harness" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Restored old-skill.")).toBeNull();
  });

  it("keeps a partial publish in the band, with its action", async () => {
    stubHarnessServer({
      read: { body: DELETED_ROW },
      refresh: { body: DELETED_ROW },
      plan: { body: PLAN },
      publish: { body: { tag: "v1.3.0", revision: PLAN.revision } },
      inventory: { afterPublish: { body: {}, status: 500 } },
    });
    renderHarness();

    await publish();

    const notice = await bandNotice("Release published");
    expect(
      within(notice).getByRole("button", { name: "Re-read Inventory" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Published v1.3.0.")).toBeNull();
  });

  it("dismisses an outcome and hands focus to Re-read Harness", async () => {
    stubHarnessServer({
      read: { body: DELETED_ROW },
      refresh: { body: DELETED_ROW, retry: { body: UNREAD_REVIEW } },
      restore: { body: { name: "old-skill", commit: "local-head" } },
    });
    renderHarness();
    await restore();
    await screen.findByText("Skill restored");

    await userEvent.click(
      screen.getByRole("button", { name: "Close Skill restored" }),
    );

    expect(screen.queryByText("Skill restored")).toBeNull();
    const reread = screen.getByRole("button", { name: "Re-read Harness" });
    expect(reread).toHaveFocus();

    // Dismissed until the reader runs the action again.
    await userEvent.click(reread);
    await waitFor(() => expect(reread).not.toHaveAttribute("aria-busy"));
    expect(screen.queryByText("Skill restored")).toBeNull();

    await restore();
    expect(await screen.findByText("Skill restored")).toBeInTheDocument();
  });

  it("offers no close control on a notice raised on load", async () => {
    const offline: HarnessState = {
      ...ON_DISK,
      freshness: {
        outcome: "offline",
        lastFetchedAt: ON_DISK.freshness.lastFetchedAt,
      },
    };
    stubHarnessServer({ read: { body: offline }, refresh: { body: offline } });
    renderHarness();

    expect(await screen.findByText("Status out of date")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^close /i })).toBeNull();
  });
});
