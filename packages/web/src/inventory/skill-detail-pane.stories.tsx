import type { Meta, StoryObj } from "@storybook/react-vite";
import type { DriftStatus } from "../drift/drift-view-model";
import type { SkillDeployment } from "./skill-deployments";
import { SkillDetailPane } from "./skill-detail-pane";

// Deployed-across-targets (one behind) and not-deployed-anywhere states, in the
// one pane shape (#1065). Actions are static items — stories carry no hooks.
const target = (
  label: string,
  release: string,
  status: DriftStatus,
): SkillDeployment => ({
  label,
  release,
  version: release,
  status,
  target: { kind: "repo", repoPath: label },
  removeTarget: { kind: "repo", repoPath: label },
  updateName: label,
  rowId: `repo:${label}`,
  updatable: status === "behind",
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
    targetCount: 3,
    unconfirmed: false,
    targetItems: (deployment) => [
      ...(deployment.updatable
        ? [{ label: "Update target", onSelect: () => {} }]
        : []),
      { label: "Show in Deploy-state", onSelect: () => {} },
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

export const NotDeployed: Story = {
  args: {
    targetCount: 0,
    deployments: [],
    footItems: [{ label: "Deploy skill", onSelect: () => {} }],
  },
};

// One target loaded, others still pending or unreadable: the known target shows,
// but the pane warns the reach is not yet complete (J04).
export const PartialReach: Story = {
  args: {
    targetCount: null,
    unconfirmed: true,
    footItems: [{ label: "Deploy skill", onSelect: () => {} }],
    deployments: [target("Claude Code", "v1.4.0", "up-to-date")],
  },
};
