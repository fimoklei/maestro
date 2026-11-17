import { describe, expect, it } from "vitest";
import type { TargetAction } from "./deploy-state-columns";
import { type PaneRow, targetPaneActions } from "./target-pane-actions";

const BEHIND_HEAD = {
  release: "v0.3.2",
  latestRelease: "v0.3.4",
  changed: 1,
  selected: 4,
  comparedAt: null,
};

const LABELS: Record<TargetAction, string> = {
  retry: "Retry deploy",
  import: "Import local edits",
  deploy: "Deploy skill",
  update: "Update target",
};

const facts = (
  actions: TargetAction[],
  extra: Partial<PaneRow> = {},
): PaneRow => ({
  actions: actions.map((action) => ({ action, label: LABELS[action] })),
  name: "snapper",
  updateName: "snapper",
  readFailed: false,
  group: "Repositories",
  ...(actions.includes("update") ? { head: BEHIND_HEAD } : {}),
  ...(actions.includes("retry")
    ? { pending: { kind: "deploy", release: "v0.3.2", desired: ["tdd"] } }
    : {}),
  ...extra,
});

// The pane ranks the named steps into its one primary (detail-pane.test.tsx).
const placed = (paneFacts: PaneRow) =>
  targetPaneActions(paneFacts, () => {}).map((item) =>
    item.step === undefined ? item.label : `${item.label} (${item.step})`,
  );

describe("targetPaneActions", () => {
  it("keeps Deploy skill quiet on an In sync target", () => {
    expect(placed(facts(["deploy"]))).toEqual(["Deploy skill"]);
  });

  // #1813: no fact holds Update target, so the foot's rules place it.
  it("puts a behind target's Update target at the foot in ⋮ order, each step named", () => {
    expect(placed(facts(["import", "deploy", "update"]))).toEqual([
      "Import local edits (import)",
      "Deploy skill",
      "Update target (update)",
    ]);
  });

  it("names a behind target's Update target as the step where nothing reads Local edits", () => {
    expect(placed(facts(["deploy", "update"]))).toEqual([
      "Deploy skill",
      "Update target (update)",
    ]);
  });

  it("names Import local edits as the step at the foot when the target is not behind", () => {
    expect(placed(facts(["import", "deploy"]))).toEqual([
      "Import local edits (import)",
      "Deploy skill",
    ]);
  });

  it("leaves the retry to its notice and names no other step", () => {
    expect(placed(facts(["retry", "import", "deploy", "update"]))).toEqual([
      "Import local edits",
      "Deploy skill",
      "Update target",
    ]);
  });

  // One action has one name: Global's update reads Update target too (#1802).
  it("labels Update target by the target it moves, Global included", () => {
    const items = targetPaneActions(
      facts(["deploy", "update"], { name: "Global", updateName: "Global" }),
      () => {},
    );
    expect(items.find((item) => item.step === "update")).toMatchObject({
      label: "Update target",
      name: "Update target Global",
    });
  });

  it("runs the row's action when a placed item is selected", () => {
    const selected: TargetAction[] = [];
    const items = targetPaneActions(
      facts(["import", "deploy", "update"]),
      (_row, action) => selected.push(action),
    );
    for (const item of items) item.onSelect?.();
    expect(selected).toEqual(["import", "deploy", "update"]);
  });
});
