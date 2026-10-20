import type {
  HarnessFreshness,
  HarnessStage,
  HarnessStageRow,
  HarnessState,
  StageStatus,
} from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  installHarnessHooks,
  openRowMenu,
  RELEASED,
  renderHarness,
  row,
  stubHarnessServer,
  withStages,
} from "./harness-flow-fixture";
import { pullRequest } from "./stage-row-fixture";

installHarnessHooks();

// What one row's ⋮ holds, as the author sees it: every action the stage
// carries and every pull-request link. An absent action is never a disabled
// one; the Status hover card names why it is absent (#1125).

const FETCHED: HarnessFreshness = {
  outcome: "fetched",
  lastFetchedAt: "2026-08-03T11:56:00.000Z",
};

const STAGE_KEY = {
  "pending-proposal": "proposal",
  "pending-review": "review",
  "pending-release": "release",
} as const;

const STAGE_TITLE = {
  "pending-proposal": "Pending proposal",
  "pending-review": "Pending review",
  "pending-release": "Pending release",
} as const;

// A Pending review row with an open request unless the test says otherwise.
const stageRow = (
  stage: HarnessStage,
  status: StageStatus,
  over: Partial<HarnessStageRow> = {},
  skill = "tdd",
): HarnessStageRow =>
  row(stage, skill, status, { requests: [pullRequest(45)], ...over });

const settled = async () => {
  const reread = await screen.findByRole("button", {
    name: "Re-read Harness",
  });
  await waitFor(() => expect(reread).not.toHaveAttribute("aria-busy"));
};

const menuItems = (menu: HTMLElement) => {
  const items = within(menu).getAllByRole("menuitem");
  const named = (keep: (item: HTMLElement) => boolean) =>
    items.filter(keep).map((item) => item.textContent);
  return {
    labels: named(() => true),
    disabled: named((item) => item.getAttribute("aria-disabled") === "true"),
    // It drops or deletes something: red, behind its own divider (#994).
    danger: named((item) => item.classList.contains("text-red-11")),
  };
};

// Paints the rows in their stages, waits for the open-time read to settle,
// and opens the first row's menu.
const menuOf = async (
  rows: HarnessStageRow[],
  state: Partial<HarnessState> = {},
) => {
  const stages: Partial<
    Record<"proposal" | "review" | "release", HarnessStageRow[]>
  > = {};
  for (const each of rows) {
    const key = STAGE_KEY[each.stage];
    stages[key] = [...(stages[key] ?? []), each];
  }
  stubHarnessServer({
    read: {
      body: withStages({ ...RELEASED, freshness: FETCHED, ...state }, stages),
    },
  });
  renderHarness();
  await settled();
  const [first] = rows;
  if (first === undefined) throw new Error("no row");
  return menuItems(await openRowMenu(first.name, STAGE_TITLE[first.stage]));
};

describe("Harness row menu", () => {
  it("offers Propose change on local work with no proposal", async () => {
    const menu = await menuOf([
      stageRow("pending-proposal", "not-yet-proposed", { requests: [] }),
    ]);

    expect(menu.labels).toEqual(["Propose change"]);
  });

  it("offers Update proposal on local work behind an open proposal", async () => {
    const menu = await menuOf([stageRow("pending-proposal", "new-local-work")]);

    // The next step leads the menu; the way to GitHub follows (#1045).
    expect(menu.labels).toEqual(["Update proposal", "View pull request"]);
  });

  describe("Delete skill", () => {
    const proposal = (over: Partial<HarnessStageRow> = {}) =>
      stageRow("pending-proposal", "not-yet-proposed", {
        requests: [],
        onDisk: true,
        ...over,
      });

    // Discard change too would only repeat Delete skill on a skill nothing
    // else holds (#1375).
    it("offers it, and no Discard change, on a never-proposed skill that exists nowhere else", async () => {
      const menu = await menuOf([proposal({ localOnly: true })]);

      expect(menu.labels).toEqual(["Propose change", "Delete skill"]);
      expect(menu.danger).toEqual(["Delete skill"]);
    });

    it.each([
      ["not yet proposed", { status: "not-yet-proposed" as const }],
      ["behind an open proposal", { status: "new-local-work" as const }],
    ])(
      "offers it, last and red, on a default-branch skill %s",
      async (_what, over) => {
        const menu = await menuOf([
          proposal({ remoteTree: "remote-tdd", ...over }),
        ]);

        expect(menu.labels.at(-1)).toBe("Delete skill");
        expect(menu.danger.at(-1)).toBe("Delete skill");
      },
    );

    // Step 2 could not follow: the default branch has nothing to delete, and
    // Withdraw proposal is the way out.
    it("never offers it on a new skill that is proposed but not merged", async () => {
      const menu = await menuOf([
        proposal({ status: "new-local-work", remoteTree: null }),
      ]);

      expect(menu.labels).not.toContain("Delete skill");
    });

    it("never offers it on a row that is already deleted locally", async () => {
      const menu = await menuOf([
        proposal({
          change: "deletion",
          remoteTree: "remote-tdd",
          onDisk: false,
        }),
      ]);

      expect(menu.labels).not.toContain("Delete skill");
    });

    it("offers it on Pending release after the links when the folder is on disk", async () => {
      const menu = await menuOf([
        stageRow("pending-release", "not-yet-released", { onDisk: true }),
      ]);

      expect(menu.labels).toEqual(["View pull request", "Delete skill"]);
      expect(menu.danger).toEqual(["Delete skill"]);
    });

    it("never offers it on a Pending release row that reads Deleted", async () => {
      const menu = await menuOf([
        stageRow("pending-release", "not-yet-released", {
          change: "deletion",
          onDisk: false,
        }),
      ]);

      expect(menu.labels).not.toContain("Delete skill");
    });

    it.each([
      "waiting-for-review",
      "proposal-closed",
      "pull-request-missing",
    ] as StageStatus[])(
      "never offers it on a Pending review row (%s)",
      async (status) => {
        const menu = await menuOf([
          stageRow("pending-review", status, {
            onDisk: true,
            remoteTree: "remote-tdd",
          }),
        ]);

        expect(menu.labels).not.toContain("Delete skill");
      },
    );
  });

  describe("Discard change", () => {
    const unproposed = (over: Partial<HarnessStageRow> = {}) =>
      stageRow("pending-proposal", "not-yet-proposed", {
        requests: [],
        onDisk: true,
        remoteTree: "remote-tdd",
        ...over,
      });

    it("sits between Propose change and Delete skill, in red, on a default-branch skill", async () => {
      const menu = await menuOf([unproposed()]);

      expect(menu.labels).toEqual([
        "Propose change",
        "Discard change",
        "Delete skill",
      ]);
      expect(menu.danger).toEqual(["Discard change", "Delete skill"]);
    });

    it.each([
      ["behind an open proposal", { status: "new-local-work" as const }],
      [
        "that proposes a deletion",
        { change: "deletion" as const, onDisk: false },
      ],
    ])("never offers it on a row %s", async (_what, over) => {
      const menu = await menuOf([unproposed(over)]);

      expect(menu.labels).not.toContain("Discard change");
    });

    it("never offers it outside Pending proposal", async () => {
      const menu = await menuOf([
        stageRow("pending-review", "waiting-for-review", {
          onDisk: true,
          remoteTree: "remote-tdd",
        }),
      ]);

      expect(menu.labels).not.toContain("Discard change");
    });
  });

  // While the remote's answer is unknown there is no tip to build on, so every
  // write closes; a link still reaches GitHub (#519).
  describe("while GitHub gave no answer", () => {
    const OFFLINE = {
      freshness: { outcome: "offline", lastFetchedAt: null },
    } as const;

    it("closes Discard change and Delete skill with Propose change", async () => {
      const menu = await menuOf(
        [
          stageRow("pending-proposal", "not-yet-proposed", {
            requests: [],
            onDisk: true,
            remoteTree: "remote-tdd",
          }),
        ],
        OFFLINE,
      );

      expect(menu.disabled).toEqual([
        "Propose change",
        "Discard change",
        "Delete skill",
      ]);
    });

    it("keeps every link usable while the writes are closed", async () => {
      const menu = await menuOf(
        [stageRow("pending-review", "waiting-for-review")],
        OFFLINE,
      );

      expect(menu.labels).toEqual(["View pull request", "Withdraw proposal"]);
      expect(menu.disabled).toEqual(["Withdraw proposal"]);
    });
  });

  describe("another contributor's open proposal", () => {
    const theirs = { ...pullRequest(45), author: "teammate", byOther: true };

    it("offers no write to their request, only its link", async () => {
      const menu = await menuOf([
        stageRow("pending-review", "proposed-by-other", {
          requests: [theirs],
          waitingOn: "teammate",
        }),
      ]);

      expect(menu.labels).toEqual(["View pull request"]);
    });

    it("keeps local work local: no Propose change, but Discard and Delete stay", async () => {
      const menu = await menuOf([
        stageRow("pending-proposal", "not-yet-proposed", {
          requests: [theirs],
          waitingOn: "teammate",
          remoteTree: "remote-tdd",
          onDisk: true,
        }),
      ]);

      expect(menu.labels).toEqual([
        "View pull request",
        "Discard change",
        "Delete skill",
      ]);
    });

    it("offers no Update proposal on local work behind their request", async () => {
      const menu = await menuOf([
        stageRow("pending-proposal", "new-local-work", {
          requests: [theirs],
          waitingOn: "teammate",
        }),
      ]);

      expect(menu.labels).toEqual(["View pull request"]);
    });

    it("offers no Reopen proposal on their closed request, but Propose change stays", async () => {
      const menu = await menuOf([
        stageRow("pending-review", "proposal-closed", { requests: [theirs] }),
      ]);

      expect(menu.labels).toEqual(["View pull request", "Propose change"]);
    });
  });

  it.each([
    "waiting-for-review",
    "draft",
    "changes-requested",
    "approved-awaiting-merge",
  ] as StageStatus[])(
    "offers Withdraw proposal beside the link on an open request (%s)",
    async (status) => {
      const menu = await menuOf([stageRow("pending-review", status)]);

      expect(menu.labels).toEqual(["View pull request", "Withdraw proposal"]);
    },
  );

  it("offers Create pull request alone where no request exists", async () => {
    const menu = await menuOf([
      stageRow("pending-review", "pull-request-missing", { requests: [] }),
    ]);

    expect(menu.labels).toEqual(["Create pull request"]);
  });

  // A merged request leaves the branch behind it. Where that branch already
  // carries newer work, Create pull request is the only way on — without it
  // the row is a dead end. Withdrawal is not a press GitHub would accept.
  it("keeps Create pull request on a merged proposal", async () => {
    const menu = await menuOf([stageRow("pending-review", "proposal-merged")]);

    expect(menu.labels).toEqual(["View pull request", "Create pull request"]);
  });

  describe("a closed deletion", () => {
    it("offers Reopen proposal while the folder is deleted", async () => {
      const menu = await menuOf([
        stageRow("pending-review", "proposal-closed", {
          change: "deletion",
          onDisk: false,
          restorable: true,
        }),
      ]);

      expect(menu.labels).toEqual([
        "View pull request",
        "Reopen proposal",
        "Restore skill",
      ]);
    });

    // Reopening it once the folder is restored would propose deleting a skill
    // the author kept (#1384).
    it("offers no Reopen proposal once the folder is restored", async () => {
      const menu = await menuOf([
        stageRow("pending-review", "proposal-closed", {
          change: "deletion",
          onDisk: true,
        }),
      ]);

      expect(menu.labels).toEqual(["View pull request"]);
    });
  });

  it("names each closed request where more than one could be reopened", async () => {
    const menu = await menuOf([
      stageRow("pending-review", "proposal-closed", {
        requests: [pullRequest(41), pullRequest(44)],
      }),
    ]);

    expect(menu.labels).toEqual([
      "View pull request #41",
      "View pull request #44",
      "Reopen proposal #41",
      "Reopen proposal #44",
      "Propose change",
    ]);
  });

  it("offers only the link on merged work, which has no undo here", async () => {
    const menu = await menuOf([
      stageRow("pending-release", "not-yet-released"),
    ]);

    expect(menu.labels).toEqual(["View pull request"]);
  });

  // #1125: a menu lists only what the row's state calls for; the Status hover
  // card names why the rest is absent.
  it.each([
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
  ] as [HarnessStage, StageStatus][])(
    "turns no absent action into a disabled one (%s, %s)",
    async (stage, status) => {
      const menu = await menuOf([stageRow(stage, status)]);

      expect(menu.disabled).toEqual([]);
    },
  );

  // Remove stays reserved for deployed copies: nothing in the journey offers
  // it, whatever the row proposes (#847). A closed proposal is the one stage
  // where they differ (#1384); its own tests above cover it.
  it.each([
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
  ] as [HarnessStage, StageStatus][])(
    "gives a deletion the same actions a change gets, and never Remove (%s, %s)",
    async (stage, status) => {
      const asChange = await menuOf([
        stageRow(stage, status),
        stageRow(stage, status, { change: "deletion" }, "old-skill"),
      ]);
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
      const asDeletion = menuItems(
        await openRowMenu("old-skill", STAGE_TITLE[stage]),
      );

      expect(asDeletion.labels).toEqual(asChange.labels);
      expect(asDeletion.labels.some((label) => label?.includes("Remove"))).toBe(
        false,
      );
    },
  );

  // Recovery is a local act: the folder and the commit it comes from are both
  // in the clone, so nothing GitHub says can take the way back away (#915).
  describe("Restore skill", () => {
    const deleted = stageRow("pending-proposal", "not-yet-proposed", {
      requests: [],
      change: "deletion",
      restorable: true,
    });

    // There is nothing to confirm a restoration against, so the press is not
    // offered at all: a menu item that could only refuse is worse than none.
    it("offers nothing where the local commit could not be read", async () => {
      const menu = await menuOf([deleted], { localHeadCommit: null });

      expect(menu.labels).not.toContain("Restore skill");
    });

    it("closes while a read is rewriting the clone, and opens once it lands", async () => {
      let land = () => {};
      const held = new Promise<void>((resolve) => {
        land = resolve;
      });
      const state = withStages(
        { ...RELEASED, freshness: FETCHED },
        { proposal: [deleted] },
      );
      stubHarnessServer({
        read: { body: state },
        refresh: { body: state, heldUntil: held },
      });
      renderHarness();

      const restore = async () =>
        within(await openRowMenu("tdd")).getByRole("menuitem", {
          name: /^restore skill$/i,
        });
      expect(await restore()).toHaveAttribute("aria-disabled", "true");
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());

      land();
      await settled();
      expect(await restore()).not.toHaveAttribute("aria-disabled");
    });
  });
});
