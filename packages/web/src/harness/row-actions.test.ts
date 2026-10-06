import type { HarnessStage, HarnessStageRow, StageStatus } from "@maestro/core";
import { describe, expect, it } from "vitest";
import {
  rowItems as buildItems,
  type RestoreGate,
  type RowActionHandlers,
} from "./row-actions";
import { pullRequest } from "./stage-row-fixture";

// The restore gate defaults to the open one here, and only here: the view has
// one caller and passes it by hand, so a wrong call cannot pass typecheck.
const rowItems = (
  row: HarnessStageRow,
  handlers: RowActionHandlers,
  enabled: boolean,
  restore: RestoreGate = { enabled, commit: "local-head" },
) => buildItems(row, handlers, enabled, restore);

const row = (over: Partial<HarnessStageRow> = {}): HarnessStageRow => ({
  stage: "pending-review" as HarnessStage,
  skill: "tdd",
  status: "waiting-for-review" as StageStatus,
  change: "edit",
  requests: [pullRequest(45)],
  reviewers: [],
  comparison: null,
  alsoIn: null,
  concurrentChange: false,
  localOnly: false,
  remoteTree: null,
  restorable: false,
  folderOnDisk: false,
  previousName: null,
  ...over,
});

const noop = () => {};
const handlers = {
  promote: noop,
  create: noop,
  reopen: () => {},
  withdraw: () => {},
  deleteLocal: () => {},
  discard: () => {},
  restore: () => {},
};

const labels = (items: ReturnType<typeof rowItems>) =>
  items.map((item) => item.label);

const disabled = (items: ReturnType<typeof rowItems>) =>
  items.filter((item) => item.disabled === true).map((item) => item.label);

describe("rowItems", () => {
  it("offers Propose change on local work with no proposal", () => {
    const items = rowItems(
      row({
        stage: "pending-proposal",
        status: "not-yet-proposed",
        requests: [],
      }),
      handlers,
      true,
    );

    expect(labels(items)).toEqual(["Propose change"]);
  });

  describe("Delete skill", () => {
    const proposal = (over: Partial<HarnessStageRow> = {}) =>
      row({
        stage: "pending-proposal",
        status: "not-yet-proposed",
        requests: [],
        folderOnDisk: true,
        ...over,
      });

    it("offers it on a never-proposed skill that exists nowhere else", () => {
      const items = rowItems(proposal({ localOnly: true }), handlers, true);

      expect(labels(items)).toEqual(["Propose change", "Delete skill"]);
      // It deletes files, so it stands apart in red (#994).
      expect(items.at(-1)?.danger).toBe(true);
    });

    it.each([
      ["not yet proposed", { status: "not-yet-proposed" as const }],
      ["behind an open proposal", { status: "new-local-work" as const }],
    ])("offers it, last, on a default-branch skill %s", (_what, over) => {
      const items = rowItems(
        proposal({ remoteTree: "remote-tdd", ...over }),
        handlers,
        true,
      );

      expect(labels(items).at(-1)).toBe("Delete skill");
      expect(items.at(-1)?.danger).toBe(true);
    });

    // Step 2 could not follow: the default branch has nothing to delete, and
    // Withdraw proposal is the way out.
    it("never offers it on a new skill that is proposed but not merged", () => {
      const items = rowItems(
        proposal({ status: "new-local-work", remoteTree: null }),
        handlers,
        true,
      );

      expect(labels(items)).not.toContain("Delete skill");
    });

    it("never offers it on a row that is already deleted locally", () => {
      const items = rowItems(
        proposal({
          status: "not-yet-proposed",
          change: "deletion",
          remoteTree: "remote-tdd",
          folderOnDisk: false,
        }),
        handlers,
        true,
      );

      expect(labels(items)).not.toContain("Delete skill");
    });

    it("offers it on Pending release after the links when the folder is on disk", () => {
      const items = rowItems(
        row({
          stage: "pending-release",
          status: "not-yet-released",
          folderOnDisk: true,
        }),
        handlers,
        true,
      );

      expect(labels(items)).toEqual(["View pull request", "Delete skill"]);
      expect(items.at(-1)?.danger).toBe(true);
    });

    it("never offers it on a Pending release row that reads Deleted", () => {
      const items = rowItems(
        row({
          stage: "pending-release",
          status: "not-yet-released",
          change: "deletion",
          folderOnDisk: false,
        }),
        handlers,
        true,
      );

      expect(labels(items)).not.toContain("Delete skill");
    });

    it.each([
      "waiting-for-review",
      "proposal-closed",
      "pull-request-missing",
    ] as StageStatus[])(
      "never offers it on a Pending review row (%s)",
      (status) => {
        const items = rowItems(
          row({ status, folderOnDisk: true, remoteTree: "remote-tdd" }),
          handlers,
          true,
        );

        expect(labels(items)).not.toContain("Delete skill");
      },
    );

    it("hands over the row it was pressed on", () => {
      const pressed: HarnessStageRow[] = [];
      const pressedRow = proposal({ localOnly: true });
      const items = rowItems(
        pressedRow,
        { ...handlers, deleteLocal: (row) => pressed.push(row) },
        true,
      );

      items.find((item) => item.label === "Delete skill")?.onSelect?.();
      expect(pressed).toEqual([pressedRow]);
    });

    it("closes while the remote's answer is unknown", () => {
      const items = rowItems(proposal({ localOnly: true }), handlers, false);

      expect(disabled(items)).toContain("Delete skill");
    });
  });

  describe("Discard change", () => {
    const unproposed = (over: Partial<HarnessStageRow> = {}) =>
      row({
        stage: "pending-proposal",
        status: "not-yet-proposed",
        requests: [],
        folderOnDisk: true,
        remoteTree: "remote-tdd",
        ...over,
      });

    it("sits between Propose change and Delete skill, in red, on a default-branch skill", () => {
      const items = rowItems(unproposed(), handlers, true);

      expect(labels(items)).toEqual([
        "Propose change",
        "Discard change",
        "Delete skill",
      ]);
      expect(items[1]?.danger).toBe(true);
    });

    // Delete skill already does the same to a skill nothing else holds.
    it("never offers it on a skill that is only in the clone", () => {
      const items = rowItems(
        unproposed({ localOnly: true, remoteTree: null }),
        handlers,
        true,
      );

      expect(labels(items)).toEqual(["Propose change", "Delete skill"]);
    });

    it.each([
      ["behind an open proposal", { status: "new-local-work" as const }],
      [
        "that proposes a deletion",
        { change: "deletion" as const, folderOnDisk: false },
      ],
    ])("never offers it on a row %s", (_what, over) => {
      const items = rowItems(unproposed(over), handlers, true);

      expect(labels(items)).not.toContain("Discard change");
    });

    it("never offers it outside Pending proposal", () => {
      const items = rowItems(
        row({ folderOnDisk: true, remoteTree: "remote-tdd" }),
        handlers,
        true,
      );

      expect(labels(items)).not.toContain("Discard change");
    });

    it("hands over the row it was pressed on, and closes with the other writes", () => {
      const pressed: HarnessStageRow[] = [];
      const pressedRow = unproposed();
      const items = rowItems(
        pressedRow,
        { ...handlers, discard: (row) => pressed.push(row) },
        true,
      );

      items.find((item) => item.label === "Discard change")?.onSelect?.();
      expect(pressed).toEqual([pressedRow]);
      expect(disabled(rowItems(pressedRow, handlers, false))).toContain(
        "Discard change",
      );
    });
  });

  it("offers Update proposal on local work behind an open proposal", () => {
    const items = rowItems(
      row({ stage: "pending-proposal", status: "new-local-work" }),
      handlers,
      true,
    );

    // The next step leads the menu; the way to GitHub follows (#1045).
    expect(labels(items)).toEqual(["Update proposal", "View pull request"]);
  });

  it("offers Withdraw proposal beside the link on an open request", () => {
    for (const status of [
      "waiting-for-review",
      "draft",
      "changes-requested",
      "approved-awaiting-merge",
    ] as StageStatus[]) {
      expect(labels(rowItems(row({ status }), handlers, true))).toEqual([
        "View pull request",
        "Withdraw proposal",
      ]);
    }
  });

  it("offers Create pull request, and no withdrawal without a request", () => {
    const items = rowItems(
      row({ status: "pull-request-missing", requests: [] }),
      handlers,
      true,
    );

    expect(labels(items)).toEqual(["Create pull request"]);
  });

  // A merged request leaves the branch behind it. Where that branch already
  // carries newer work, Create pull request is the only way on — without it
  // the row is a dead end. Withdrawal is not a press GitHub would accept.
  it("keeps Create pull request on a merged proposal", () => {
    const items = rowItems(row({ status: "proposal-merged" }), handlers, true);

    expect(labels(items)).toEqual(["View pull request", "Create pull request"]);
  });

  it("offers Reopen proposal, with Propose change behind it", () => {
    const items = rowItems(row({ status: "proposal-closed" }), handlers, true);

    expect(labels(items)).toEqual([
      "View pull request",
      "Reopen proposal",
      "Propose change",
    ]);
  });

  it("offers Reopen proposal on a closed deletion while the folder is deleted", () => {
    const items = rowItems(
      row({
        status: "proposal-closed",
        change: "deletion",
        folderOnDisk: false,
        restorable: true,
      }),
      handlers,
      true,
    );

    expect(labels(items)).toEqual([
      "View pull request",
      "Reopen proposal",
      "Restore skill",
    ]);
  });

  it("offers no Reopen proposal on a closed deletion once the folder is restored", () => {
    const items = rowItems(
      row({
        status: "proposal-closed",
        change: "deletion",
        folderOnDisk: true,
      }),
      handlers,
      true,
    );

    expect(labels(items)).toEqual(["View pull request"]);
  });

  it("names each closed request where more than one could be reopened", () => {
    const items = rowItems(
      row({
        status: "proposal-closed",
        requests: [pullRequest(41), pullRequest(44)],
      }),
      handlers,
      true,
    );

    expect(labels(items)).toEqual([
      "View pull request #41",
      "View pull request #44",
      "Reopen proposal #41",
      "Reopen proposal #44",
      "Propose change",
    ]);
  });

  it("lists every link and no mutation under an ambiguity", () => {
    const items = rowItems(
      row({
        status: "multiple-pull-requests",
        requests: [pullRequest(41), pullRequest(44)],
      }),
      handlers,
      true,
    );

    expect(labels(items)).toEqual([
      "View pull request #41",
      "View pull request #44",
    ]);
  });

  it("offers only the link on merged work, which has no undo here", () => {
    const items = rowItems(
      row({ stage: "pending-release", status: "not-yet-released" }),
      handlers,
      true,
    );

    expect(labels(items)).toEqual(["View pull request"]);
  });

  it("keeps every link usable while the mutations are closed", () => {
    const items = rowItems(
      row({ status: "waiting-for-review" }),
      handlers,
      false,
    );

    expect(disabled(items)).toEqual(["Withdraw proposal"]);
  });

  it("gives a deletion the same actions a change gets, and never Remove", () => {
    // Remove stays reserved for deployed copies: nothing in the journey
    // offers it, whatever the row proposes (#847). A closed proposal is the
    // one stage where they differ (#1384); its own tests above cover it.
    const every = (
      [
        ["pending-proposal", "not-yet-proposed"],
        ["pending-proposal", "new-local-work"],
        ["pending-review", "draft"],
        ["pending-review", "waiting-for-review"],
        ["pending-review", "changes-requested"],
        ["pending-review", "approved-awaiting-merge"],
        ["pending-review", "pull-request-missing"],
        ["pending-review", "proposal-merged"],
        ["pending-review", "multiple-pull-requests"],
        ["pending-release", "not-yet-released"],
      ] as [HarnessStage, StageStatus][]
    ).flatMap(([stage, status]) => {
      const asChange = labels(rowItems(row({ stage, status }), handlers, true));
      const asDeletion = labels(
        rowItems(row({ stage, status, change: "deletion" }), handlers, true),
      );
      expect(asDeletion, status).toEqual(asChange);
      return asDeletion;
    });

    expect(every.some((label) => label.includes("Remove"))).toBe(false);
  });

  // #1125: a menu lists only what the row's state calls for; the Status hover
  // card names why the rest is absent.
  it("turns no absent action into a disabled one", () => {
    const every = (
      [
        ["pending-proposal", "not-yet-proposed"],
        ["pending-proposal", "new-local-work"],
        ["pending-review", "draft"],
        ["pending-review", "waiting-for-review"],
        ["pending-review", "changes-requested"],
        ["pending-review", "approved-awaiting-merge"],
        ["pending-review", "pull-request-missing"],
        ["pending-review", "proposal-merged"],
        ["pending-review", "proposal-closed"],
        ["pending-review", "multiple-pull-requests"],
        ["pending-release", "not-yet-released"],
      ] as [HarnessStage, StageStatus][]
    ).flatMap(([stage, status]) =>
      disabled(rowItems(row({ stage, status }), handlers, true)),
    );

    expect(every).toEqual([]);
  });

  // Recovery is a local act: the folder and the commit it comes from are both
  // in the clone, so nothing GitHub says can take the way back away (#915).
  describe("Restore skill", () => {
    const restorable = (over: Partial<HarnessStageRow> = {}) =>
      row({ restorable: true, ...over });

    const open: RestoreGate = { enabled: true, commit: "local-head" };

    it("closes every menu that carries it, last of all", () => {
      const items = rowItems(
        restorable({
          stage: "pending-proposal",
          status: "not-yet-proposed",
          change: "deletion",
        }),
        handlers,
        true,
        open,
      );

      expect(labels(items).at(-1)).toBe("Restore skill");
    });

    it("offers it in Pending review too", () => {
      expect(labels(rowItems(restorable(), handlers, true, open)).at(-1)).toBe(
        "Restore skill",
      );
    });

    it("offers nothing at all on a row that cannot be restored", () => {
      expect(labels(rowItems(row(), handlers, true, open))).not.toContain(
        "Restore skill",
      );
      // Not a disabled variant either: an ineligible row shows no item.
      expect(disabled(rowItems(row(), handlers, true, open))).not.toContain(
        "Restore skill",
      );
    });

    // There is nothing to confirm a restoration against, so the press is not
    // offered at all: a menu item that could only refuse is worse than none.
    it("offers nothing where the local commit could not be read", () => {
      const items = rowItems(restorable(), handlers, true, {
        enabled: true,
        commit: null,
      });

      expect(labels(items)).not.toContain("Restore skill");
      expect(disabled(items)).not.toContain("Restore skill");
    });

    // The remote's silence closes every other action on the row; this one is
    // the offline way back, so it keeps its own flag.
    it("stays open while the remote actions are closed", () => {
      const items = rowItems(restorable(), handlers, false, open);

      expect(disabled(items)).not.toContain("Restore skill");
    });

    it("closes while a local change is already running", () => {
      const items = rowItems(restorable(), handlers, true, {
        ...open,
        enabled: false,
      });

      expect(disabled(items)).toContain("Restore skill");
    });

    it("names the row it was pressed on and the commit it was painted at", () => {
      const pressed: [string, string][] = [];
      const items = rowItems(
        restorable({ skill: "code-review" }),
        {
          ...handlers,
          restore: (row: HarnessStageRow, commit: string) =>
            pressed.push([row.skill, commit]),
        },
        true,
        open,
      );

      items.find((item) => item.label === "Restore skill")?.onSelect?.();

      expect(pressed).toEqual([["code-review", "local-head"]]);
    });
  });
});
