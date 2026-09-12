import type { UpdatePreview } from "@maestro/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { HttpError } from "../api/http";
import { updatePreviewNotice } from "./notice-copy";
import { UpdateTargetDialog } from "./update-target-dialog";

const row = (name: string) => ({
  name,
  url: `https://github.com/fimoklei/agent-harness/tree/v0.3.4/.apm/skills/${name}`,
});

const PREVIEW: UpdatePreview = {
  release: "v0.3.2",
  chosenRelease: "v0.3.4",
  counts: { changed: 2, removed: 1, unchanged: 3 },
  addedByThisDeploy: [],
  changed: [row("tdd"), row("jobs")],
  removed: ["review"],
  unchanged: ["grill", "brief", "worktree"],
  newInRelease: [row("wizard")],
  localEdits: { discard: [], unverified: [] },
  selection: {
    current: ["tdd", "jobs", "review", "grill", "brief", "worktree"],
    desired: ["tdd", "jobs", "grill", "brief", "worktree"],
  },
  copyReceipt: null,
  token: "a".repeat(64),
};

const meta = {
  title: "DeployState/UpdateTargetDialog",
  component: UpdateTargetDialog,
  args: {
    targetName: "agent-harness",
    preview: PREVIEW,
    isLoading: false,
    error: null,
    onCancel: () => {},
    onConfirm: () => {},
  },
} satisfies Meta<typeof UpdateTargetDialog>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Priced: Story = {};

// The release touches nothing selected, and the confirm is still on offer.
export const NoContentChanges: Story = {
  args: {
    preview: {
      ...PREVIEW,
      counts: { changed: 0, removed: 0, unchanged: 3 },
      changed: [],
      removed: [],
      selection: {
        current: ["grill", "brief", "worktree"],
        desired: ["grill", "brief", "worktree"],
      },
    },
  },
};

// Copies stand in the way: each one states its cost and carries its own
// consent, and the confirm waits for both.
export const ConsentRequired: Story = {
  args: {
    preview: {
      ...PREVIEW,
      localEdits: {
        discard: [{ name: "tdd", tool: "claude" }],
        unverified: [{ name: "jobs", tool: "codex" }],
      },
      copyReceipt: "b".repeat(64),
    },
  },
};

// Every selected skill disappears at the chosen release.
export const BecomesEmpty: Story = {
  args: {
    preview: {
      ...PREVIEW,
      counts: { changed: 0, removed: 1, unchanged: 0 },
      changed: [],
      unchanged: [],
      removed: ["review"],
      selection: { current: ["review"], desired: [] },
    },
  },
};

export const Refused: Story = {
  args: {
    preview: null,
    error: updatePreviewNotice(new HttpError(404, "unused", "not-deployed")),
  },
};

// What landed, read back per copy. The ledger replaces the sections (#954).
export const Outcome: Story = {
  args: {
    outcome: [
      { name: "tdd", tool: null, state: "updated" },
      { name: "jobs", tool: null, state: "updated" },
      { name: "review", tool: null, state: "removed" },
    ],
  },
};

// A partial landing, with the tool named where the copies disagree.
export const IncompleteOutcome: Story = {
  args: {
    incomplete: true,
    outcome: [
      { name: "tdd", tool: null, state: "updated" },
      { name: "jobs", tool: "claude", state: "updated" },
      { name: "jobs", tool: "codex", state: "not-updated" },
      { name: "review", tool: null, state: "not-removed" },
    ],
  },
};
