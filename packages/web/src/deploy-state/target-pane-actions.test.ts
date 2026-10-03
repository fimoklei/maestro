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
  updateName: "snapper",
  readFailed: false,
  group: "Repositories",
  ...(actions.includes("update") ? { head: BEHIND_HEAD } : {}),
  ...(actions.includes("retry")
    ? { pending: { kind: "deploy", release: "v0.3.2", desired: ["tdd"] } }
    : {}),
  ...extra,
});

const placed = (paneFacts: PaneRow) => {
  const { update, foot, footPrimary } = targetPaneActions(paneFacts, () => {});
  return {
    update:
      update === null
        ? null
        : `${update.name}${update.primary ? " (primary)" : ""}`,
    foot: foot.map((item) =>
      item.label === footPrimary ? `${item.label} (primary)` : item.label,
    ),
  };
};

describe("targetPaneActions", () => {
  it("keeps Deploy skill quiet on an In sync target", () => {
    expect(placed(facts(["deploy"]))).toEqual({
      update: null,
      foot: ["Deploy skill"],
    });
  });

  it("puts a behind target's Update target beside Latest release, as its primary", () => {
    expect(placed(facts(["import", "deploy", "update"]))).toEqual({
      update: "Update target snapper (primary)",
      foot: ["Import local edits", "Deploy skill"],
    });
  });

  it("makes Import local edits primary at the foot when the target is not behind", () => {
    expect(placed(facts(["import", "deploy"]))).toEqual({
      update: null,
      foot: ["Import local edits (primary)", "Deploy skill"],
    });
  });

  it("leaves the retry to its notice and makes nothing else primary", () => {
    expect(placed(facts(["retry", "import", "deploy", "update"]))).toEqual({
      update: "Update target snapper",
      foot: ["Import local edits", "Deploy skill"],
    });
  });

  // #951: a global tool row reads behind when any tool is, though its own
  // release may show no Latest release fact to sit beside.
  it("keeps Update target at the foot, primary, where no Latest release fact shows", () => {
    expect(
      placed(
        facts(["deploy", "update"], {
          head: { ...BEHIND_HEAD, latestRelease: BEHIND_HEAD.release },
        }),
      ),
    ).toEqual({
      update: null,
      foot: ["Deploy skill", "Update target (primary)"],
    });
  });

  it("runs the row's action when a placed item is selected", () => {
    const selected: TargetAction[] = [];
    const { update, foot } = targetPaneActions(
      facts(["import", "deploy", "update"]),
      (_row, action) => selected.push(action),
    );
    update?.onSelect?.();
    for (const item of foot) item.onSelect?.();
    expect(selected).toEqual(["update", "import", "deploy"]);
  });

  // The notice then offers Re-read, so the retry stays at the foot.
  it("keeps the retry at the foot of a repository whose read failed", () => {
    expect(placed(facts(["retry", "deploy"], { readFailed: true }))).toEqual({
      update: null,
      foot: ["Retry deploy", "Deploy skill"],
    });
  });
});
