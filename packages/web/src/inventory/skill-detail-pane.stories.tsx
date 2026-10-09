import type { Meta, StoryObj } from "@storybook/react-vite";
import { skillMark } from "../deploy-state/skill-mark";
import type { DriftStatus } from "../drift/drift-view-model";
import type { DeployedRollup } from "./deployed-rollup";
import type { SkillDeployment } from "./skill-deployments";
import { SkillDetailPane } from "./skill-detail-pane";

const target = (
  label: string,
  release: string,
  status: DriftStatus,
): SkillDeployment => ({
  label,
  release,
  version: release,
  status,
  mark: skillMark(undefined, status),
  edited: false,
  target: { kind: "repo", repoPath: label },
  removeTarget: { kind: "repo", repoPath: label },
  updateName: label,
  rowId: `repo:${label}`,
  updatable: status === "behind",
});

const rollup = (counts: Partial<DeployedRollup>): DeployedRollup => ({
  targetCount: 0,
  behindCount: 0,
  unknownCount: 0,
  localEditsCount: 0,
  ...counts,
});

const meta = {
  title: "Inventory/SkillDetailPane",
  component: SkillDetailPane,
  args: {
    primitive: {
      type: "skill",
      name: "tdd",
      description:
        'Test-driven development. Use when the user wants to build features or fix bugs test-first, mentions "red-green-refactor", or wants integration tests.',
    },
    rollup: rollup({ targetCount: 3, behindCount: 1 }),
    latestRelease: "v1.4.0",
    listHeadingRef: null,
    targetItems: (deployment) => [
      ...(deployment.updatable
        ? [{ label: "Update target", onSelect: () => {} }]
        : []),
      { label: "View Deploy-state", onSelect: () => {} },
      { label: "Remove from target", danger: true, onSelect: () => {} },
    ],
    footItems: [
      { label: "Deploy skill", onSelect: () => {} },
      { label: "Remove from all 3 targets", danger: true, onSelect: () => {} },
    ],
    position: { index: 3, count: 36 },
    onClose: () => {},
    getTriggerElement: () => null,
    deployments: [
      target("Claude Code", "v1.4.0", "up-to-date"),
      target("Codex", "v1.3.2", "behind"),
      target("maestro", "v1.4.0", "up-to-date"),
    ],
  },
  decorators: [
    (Story) => (
      <div style={{ height: 560, display: "flex" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SkillDetailPane>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Deployed: Story = {};

// An edited copy outranks the behind one: Update target would discard it.
export const LocalEdits: Story = {
  args: {
    rollup: rollup({ targetCount: 3, localEditsCount: 1 }),
    deployments: [
      target("Claude Code", "v1.4.0", "up-to-date"),
      {
        ...target("Codex", "v1.3.2", "behind"),
        edited: true,
        mark: skillMark("local-edits", "behind"),
      },
      target("maestro", "v1.4.0", "up-to-date"),
    ],
  },
};

export const NotDeployed: Story = {
  args: {
    rollup: rollup({}),
    deployments: [],
    footItems: [{ label: "Deploy skill", onSelect: () => {} }],
  },
};

export const PartialReach: Story = {
  args: {
    rollup: rollup({ targetCount: 1, pending: true }),
    footItems: [{ label: "Deploy skill", onSelect: () => {} }],
    deployments: [target("Claude Code", "v1.4.0", "up-to-date")],
  },
};

// A target's read failed: the list may miss a target, and says so.
export const SomeTargetsNotRead: Story = {
  args: {
    rollup: rollup({ targetCount: 1, unreadable: true }),
    footItems: [{ label: "Deploy skill", onSelect: () => {} }],
    deployments: [target("Claude Code", "v1.4.0", "up-to-date")],
  },
};
