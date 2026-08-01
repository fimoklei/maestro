import type { Meta, StoryObj } from "@storybook/react-vite";
import { BulkRemoveDialog } from "./bulk-remove-dialog";
import type { BulkRemoveDialogView } from "./bulk-remove-dialog-view";

const allClean: BulkRemoveDialogView = {
  kind: "grouped",
  cleanLine: "4 clean copies — nothing but the deployed files goes",
  cost: [],
  refused: [],
  removableCount: 4,
  confirmLabel: "remove from 4 →",
};

// One story per state this dialog ships (#422, #423). The per-target report
// arrives with its own ticket and its own story.
const meta = {
  title: "Inventory/BulkRemoveDialog",
  component: BulkRemoveDialog,
  args: {
    skillName: "tdd",
    targetCount: 4,
    view: allClean,
    isRemoving: false,
    error: null,
    onCancel: () => {},
    onConfirm: () => {},
  },
} satisfies Meta<typeof BulkRemoveDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

// Checks still running: the count climbs and the confirm is held.
export const Checking: Story = {
  args: {
    view: { kind: "checking", line: "checking 4 targets — 1 answered" },
  },
};

// Nothing costs anything, so the panel says so and shows no group at all.
export const AllClean: Story = {};

// Two copies carry work the removal deletes; the outline warms and the cost
// travels on the confirm.
export const LosesWork: Story = {
  args: {
    view: {
      kind: "grouped",
      cleanLine: "2 clean copies",
      cost: [
        {
          label: "/dev/acme-api",
          version: "v1.0.0",
          reason: "local edits — deleted too",
        },
        {
          label: "/dev/design-tokens",
          version: "v1.2.0",
          reason: "check did not run",
        },
      ],
      refused: [],
      removableCount: 4,
      confirmLabel: "remove from 4 · 2 lose local edits →",
    },
  },
};

// One target cannot be touched. It is skipped by the run rather than blocking
// it, so the confirm stays live and counts only the three it will walk.
export const CannotBeRemoved: Story = {
  args: {
    view: {
      kind: "grouped",
      cleanLine: "3 clean copies",
      cost: [],
      refused: [{ label: "/dev/legacy-etl", reason: "repo not registered" }],
      removableCount: 3,
      confirmLabel: "remove from 3 →",
    },
  },
};

// Mid-run: both controls dead, escape and backdrop blocked, no per-target
// progress to read.
export const Running: Story = {
  args: { isRemoving: true },
};

// The answer was lost. What the run did is unknown, so the panel says so.
export const OutcomeUnknown: Story = {
  args: {
    error:
      "Maestro lost its server's answer and cannot say what was removed. Close this and check the targets before trying again.",
  },
};
