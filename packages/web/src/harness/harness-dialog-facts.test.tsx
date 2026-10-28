import type { HarnessStageRow } from "@maestro/core";
import { screen, within } from "@testing-library/react";
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

  it("states the branch a proposed deletion pushes to, and its guarantee", async () => {
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
    expect(
      within(dialog).getByText(
        sentence(
          "If the default branch moves before you confirm, nothing is pushed.",
        ),
      ),
    ).toBeVisible();
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

    const dialog = await press(/^delete prompt$/i);

    expect(within(dialog).getByText(PATH)).toBeVisible();
  });

  it("states the path a restore brings back, and its guarantee", async () => {
    stubHarnessServer({
      read: {
        body: withStages(ON_DISK, {
          proposal: [served({ change: "deletion", restorable: true })],
        }),
      },
    });
    renderHarness();

    const dialog = await press(/^restore prompt$/i);

    expect(within(dialog).getByText(PATH)).toBeVisible();
    expect(
      within(dialog).getByText(
        sentence(
          "If your clone's last commit moves before you confirm, nothing is restored.",
        ),
      ),
    ).toBeVisible();
  });

  it("states the path a discard puts back, and its guarantee", async () => {
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
    expect(
      within(dialog).getByText(
        sentence("If main moves before you confirm, nothing is discarded."),
      ),
    ).toBeVisible();
  });

  describe("delete", () => {
    it("describes a proposed deletion by what it pushes", async () => {
      stubHarnessServer({
        read: {
          body: withStages(ON_DISK, {
            proposal: [served({ change: "deletion", remoteTree: "abc123" })],
          }),
        },
      });
      renderHarness();

      const dialog = await press(/^propose change$/i);

      expect(dialog).toHaveAccessibleDescription(
        "Delete prompt proposes this deletion to github.com/fimoklei/agent-harness for review.",
      );
    });

    it("describes a proposed deletion over an open pull request by what the press does instead", async () => {
      stubHarnessServer({
        read: {
          body: withStages(ON_DISK, {
            proposal: [
              served({
                change: "deletion",
                remoteTree: "abc123",
                requests: [pullRequest(45, "prompt.notes")],
              }),
            ],
          }),
        },
      });
      renderHarness();

      const dialog = await press(/^propose change$/i);

      expect(dialog).toHaveAccessibleDescription(
        "Pull request #45 will delete notes instead fimoklei opened it to propose changes to notes . Delete prompt replaces those changes with the deletion.",
      );
    });

    it("describes a deletion in the clone by what it removes", async () => {
      stubHarnessServer({
        read: {
          body: withStages(ON_DISK, {
            proposal: [served({ remoteTree: "remote-notes", onDisk: true })],
          }),
        },
      });
      renderHarness();

      const dialog = await press(/^delete prompt$/i);

      expect(dialog).toHaveAccessibleDescription(
        "Delete prompt removes the notes file from your clone of fimoklei/agent-harness . The prompt stays in fimoklei/agent-harness .",
      );
    });

    it("describes a local-only deletion by what it removes", async () => {
      stubHarnessServer({
        read: {
          body: withStages(ON_DISK, {
            proposal: [served({ localOnly: true, onDisk: true })],
          }),
        },
      });
      renderHarness();

      const dialog = await press(/^delete prompt$/i);

      expect(dialog).toHaveAccessibleDescription(
        "Delete prompt removes the file from disk. No other copy of notes exists.",
      );
    });
  });

  describe("withdraw from release", () => {
    const openWithdrawal = async () => {
      stubHarnessServer({
        read: {
          body: withStages(ON_DISK, {
            release: [
              row("pending-release", "notes", "not-yet-released", {
                type: "prompt",
                path: PATH,
                branch: BRANCH,
                onDisk: true,
              }),
            ],
          }),
        },
      });
      renderHarness();
      return press(/^withdraw from release$/i, "Pending release");
    };

    it("states the item and the path it replaces, under its siblings' labels", async () => {
      const dialog = await openWithdrawal();

      const fact = (label: string) =>
        within(dialog).getByText(label, { selector: "dt" }).nextElementSibling;
      expect(fact("Prompt")).toHaveTextContent(/^notes$/);
      expect(fact("File")).toHaveTextContent(PATH);
    });

    it("describes itself by what the withdrawal changes", async () => {
      const dialog = await openWithdrawal();

      expect(dialog).toHaveAccessibleDescription(
        "This replaces the prompt file in your clone with its copy in the latest release. The prompt then waits under Pending proposal.",
      );
    });
  });
});
