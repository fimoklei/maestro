import { describe, expect, it } from "vitest";
import { rowItems } from "./row-actions";
import type { HarnessStage, HarnessStageRow, StageStatus } from "./use-harness";

const row = (over: Partial<HarnessStageRow> = {}): HarnessStageRow => ({
  stage: "pending-review" as HarnessStage,
  skill: "tdd",
  status: "waiting-for-review" as StageStatus,
  deletion: false,
  requests: [{ number: 45, url: "https://github.com/o/r/pull/45" }],
  reviewers: [],
  comparison: null,
  alsoIn: null,
  concurrentChange: false,
  remoteTree: null,
  previousName: null,
  ...over,
});

const noop = () => {};
const handlers = {
  promote: noop,
  create: noop,
  reopen: () => {},
  withdraw: () => {},
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

  it("offers Update proposal on local work behind an open proposal", () => {
    const items = rowItems(
      row({ stage: "pending-proposal", status: "new-local-work" }),
      handlers,
      true,
    );

    expect(labels(items)).toEqual(["Open pull request", "Update proposal"]);
  });

  it("offers Withdraw proposal beside the link on an open request", () => {
    for (const status of [
      "waiting-for-review",
      "draft",
      "changes-requested",
      "approved-awaiting-merge",
    ] as StageStatus[]) {
      expect(labels(rowItems(row({ status }), handlers, true))).toEqual([
        "Open pull request",
        "Withdraw proposal",
      ]);
    }
  });

  it("offers Create pull request, and blocks withdrawal with its reason", () => {
    const items = rowItems(
      row({ status: "pull-request-missing", requests: [] }),
      handlers,
      true,
    );

    expect(labels(items)).toEqual([
      "Create pull request",
      "Withdraw proposal — no request yet",
    ]);
    expect(disabled(items)).toEqual(["Withdraw proposal — no request yet"]);
  });

  it("offers Reopen proposal, with Propose change behind it", () => {
    const items = rowItems(row({ status: "proposal-closed" }), handlers, true);

    expect(labels(items)).toEqual([
      "Open pull request",
      "Reopen proposal",
      "Propose change",
    ]);
  });

  it("names each closed request where more than one could be reopened", () => {
    const items = rowItems(
      row({
        status: "proposal-closed",
        requests: [
          { number: 41, url: "https://github.com/o/r/pull/41" },
          { number: 44, url: "https://github.com/o/r/pull/44" },
        ],
      }),
      handlers,
      true,
    );

    expect(labels(items)).toEqual([
      "Open pull request #41",
      "Open pull request #44",
      "Reopen proposal #41",
      "Reopen proposal #44",
      "Propose change",
    ]);
  });

  it("lists every link and blocks both mutations under an ambiguity", () => {
    const items = rowItems(
      row({
        status: "multiple-pull-requests",
        requests: [
          { number: 41, url: "https://github.com/o/r/pull/41" },
          { number: 44, url: "https://github.com/o/r/pull/44" },
        ],
      }),
      handlers,
      true,
    );

    expect(labels(items)).toEqual([
      "Open pull request #41",
      "Open pull request #44",
      "Update proposal — close the extra requests on GitHub",
      "Withdraw proposal — close the extra requests on GitHub",
    ]);
    expect(disabled(items)).toEqual([
      "Update proposal — close the extra requests on GitHub",
      "Withdraw proposal — close the extra requests on GitHub",
    ]);
  });

  it("offers only the link on merged work, which has no undo here", () => {
    const items = rowItems(
      row({ stage: "pending-release", status: "changed" }),
      handlers,
      true,
    );

    expect(labels(items)).toEqual(["Open pull request"]);
  });

  it("keeps every link usable while the mutations are closed", () => {
    const items = rowItems(
      row({ status: "waiting-for-review" }),
      handlers,
      false,
    );

    expect(disabled(items)).toEqual(["Withdraw proposal"]);
  });

  it("turns no other absent action into a disabled one", () => {
    // Exactly the three named blocked actions, and no fourth (#844).
    const every = (
      [
        ["pending-proposal", "not-yet-proposed"],
        ["pending-proposal", "new-local-work"],
        ["pending-proposal", "deleted-locally"],
        ["pending-review", "draft"],
        ["pending-review", "waiting-for-review"],
        ["pending-review", "changes-requested"],
        ["pending-review", "approved-awaiting-merge"],
        ["pending-review", "pull-request-missing"],
        ["pending-review", "proposal-closed"],
        ["pending-review", "multiple-pull-requests"],
        ["pending-release", "added"],
        ["pending-release", "deleted"],
      ] as [HarnessStage, StageStatus][]
    ).flatMap(([stage, status]) =>
      disabled(rowItems(row({ stage, status }), handlers, true)),
    );

    expect(every).toEqual([
      "Withdraw proposal — no request yet",
      "Update proposal — close the extra requests on GitHub",
      "Withdraw proposal — close the extra requests on GitHub",
    ]);
  });
});
