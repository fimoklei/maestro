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

const meta = {
  title: "Inventory/BulkRemoveDialog",
  component: BulkRemoveDialog,
  args: {
    skillName: "tdd",
    targetCount: 4,
    view: allClean,
    isRemoving: false,
    report: null,
    onCancel: () => {},
    onConfirm: () => {},
  },
} satisfies Meta<typeof BulkRemoveDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Checking: Story = {
  args: {
    view: { kind: "checking", line: "checking 4 targets — 1 answered" },
  },
};

export const AllClean: Story = {};

export const LosesWork: Story = {
  args: {
    view: {
      kind: "grouped",
      cleanLine: "2 clean copies",
      cost: [
        {
          label: "/dev/acme-api",
          version: "v1.0.0",
          reason: "Nothing recorded — may lose work",
        },
        {
          label: "/dev/design-tokens",
          version: "v1.2.0",
          reason: "Check did not run",
        },
      ],
      refused: [],
      removableCount: 4,
      confirmLabel: "remove from 4 · 2 lose local edits →",
    },
  },
};

export const CannotBeRemoved: Story = {
  args: {
    view: {
      kind: "grouped",
      cleanLine: "3 clean copies",
      cost: [],
      refused: [
        { label: "/dev/legacy-etl", reason: "Repository not registered" },
      ],
      removableCount: 3,
      confirmLabel: "remove from 3 →",
    },
  },
};

export const Running: Story = {
  args: { isRemoving: true },
};

export const OutcomeUnknown: Story = {
  args: {
    report: {
      kind: "outcome-unknown",
      label: "Outcome unknown",
      message:
        "The run's outcome is unrecorded. Check the targets before removing again.",
      detail: "The Maestro server did not answer.",
    },
  },
};

export const ReportClean: Story = {
  args: {
    report: {
      kind: "clean",
      title: { before: "Removed ", after: "" },
      counts: "removed 4 · refused 0 · failed 0",
    },
  },
};

export const ReportPartial: Story = {
  args: {
    report: {
      kind: "partial",
      title: { before: "Removed ", after: " from 2 of 4" },
      counts: "removed 2 · refused 1 · failed 1",
      leftAlone: [
        {
          label: "/dev/acme-api",
          outcome: "failed",
          reason: "Target held by another operation — still there",
        },
        {
          label: "/dev/legacy-etl",
          outcome: "refused",
          reason: "Repository not registered",
        },
      ],
    },
  },
};

export const ReportNeverStarted: Story = {
  args: {
    report: {
      kind: "never-started",
      label: "Run not started",
      message: "Nothing was removed anywhere. Confirm the removal again.",
      detail: "The Maestro server refused the request.",
    },
  },
};
