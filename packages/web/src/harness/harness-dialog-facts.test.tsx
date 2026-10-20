import type { HarnessStageRow } from "@maestro/core";
import { screen, within } from "@testing-library/react";
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
import { pullRequest } from "./stage-row-fixture";

installHarnessHooks();

// #1597: a confirmation names the path and branch the server sent with the
// row, never ones the cockpit spells from the name.
describe("Harness confirmation facts", () => {
  const PATH = ".maestro/prompts/notes.md";
  const BRANCH = "maestro/prompt.notes";
  const served = (over: Partial<HarnessStageRow>) =>
    row("pending-proposal", "notes", "not-yet-proposed", {
      type: "prompt",
      path: PATH,
      branch: BRANCH,
      ...over,
    });

  const press = async (item: RegExp, stage = "Pending proposal") => {
    const menu = await openRowMenu("notes", stage, "prompt");
    await userEvent.click(within(menu).getByRole("menuitem", { name: item }));
    return screen.findByRole("dialog");
  };

  it("states the branch a proposed deletion pushes to", async () => {
    stubHarnessServer({
      read: {
        body: withStages(ON_DISK, {
          proposal: [served({ change: "deletion", remoteTree: "abc123" })],
        }),
      },
    });
    renderHarness();

    const dialog = await press(/^propose change$/i);

    expect(within(dialog).getByText(BRANCH)).toBeVisible();
  });

  it("states the branch a withdrawal leaves in place", async () => {
    stubHarnessServer({
      read: {
        body: withStages(ON_DISK, {
          review: [
            row("pending-review", "notes", "waiting-for-review", {
              type: "prompt",
              path: PATH,
              branch: BRANCH,
              requests: [pullRequest(45, "prompt.notes")],
            }),
          ],
        }),
      },
    });
    renderHarness();

    const dialog = await press(/^withdraw proposal$/i, "Pending review");

    expect(within(dialog).getByText(BRANCH)).toBeVisible();
  });

  it("states the path a local deletion removes", async () => {
    stubHarnessServer({
      read: {
        body: withStages(ON_DISK, {
          proposal: [served({ localOnly: true, onDisk: true })],
        }),
      },
    });
    renderHarness();

    const dialog = await press(/^delete skill$/i);

    expect(within(dialog).getByText(PATH)).toBeVisible();
  });

  it("states the path a restore brings back", async () => {
    stubHarnessServer({
      read: {
        body: withStages(ON_DISK, {
          proposal: [served({ change: "deletion", restorable: true })],
        }),
      },
    });
    renderHarness();

    const dialog = await press(/^restore skill$/i);

    expect(within(dialog).getByText(PATH)).toBeVisible();
  });

  it("states the path a discard puts back", async () => {
    stubHarnessServer({
      read: {
        body: withStages(ON_DISK, {
          proposal: [served({ remoteTree: "remote-notes", onDisk: true })],
        }),
      },
    });
    renderHarness();

    const dialog = await press(/^discard change$/i);

    expect(within(dialog).getByText(PATH)).toBeVisible();
  });
});
