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

  const serve = () =>
    stubHarnessServer({
      read: { body: DELETED_ROW },
      refresh: { body: DELETED_ROW },
      restore: { body: { name: "old-skill", commit: "local-head" } },
      plan: { body: PLAN },
      publish: { body: { tag: "v1.3.0", revision: PLAN.revision } },
    });

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
    await screen.findByText("Skill restored");
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
    await screen.findByText("Release published");
  };

  it("dismisses an outcome until the reader runs the action again", async () => {
    serve();
    renderHarness();
    await restore();

    await userEvent.click(
      screen.getByRole("button", { name: "Close Skill restored" }),
    );

    expect(screen.queryByText("Skill restored")).toBeNull();
    const reread = screen.getByRole("button", { name: "Re-read Harness" });
    expect(reread).toHaveFocus();

    await userEvent.click(reread);
    await waitFor(() => expect(reread).not.toHaveAttribute("aria-busy"));
    expect(screen.queryByText("Skill restored")).toBeNull();

    await restore();
  });

  it("hands focus to the next outcome's close control", async () => {
    serve();
    renderHarness();
    await restore();
    await publish();

    await userEvent.click(
      screen.getByRole("button", { name: "Close Release published" }),
    );

    expect(screen.queryByText("Release published")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Close Skill restored" }),
    ).toHaveFocus();
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
