import type { Meta, StoryObj } from "@storybook/react-vite";
import { BulkRemoveDialog } from "./bulk-remove-dialog";
import type { BulkRemoveDialogView } from "./bulk-remove-dialog-view";
import { LOCAL_CHANGES_NEXT_STEP } from "./inventory-copy";

const allClean: BulkRemoveDialogView = {
  kind: "grouped",
  clean: {
    label: "4 targets without local edits",
    message: "Only the deployed files are removed.",
  },
  cost: [],
  refused: [],
  refusedNote: null,
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
      clean: {
        label: "2 targets without local edits",
        message: "Only the deployed files are removed.",
      },
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
      refusedNote: null,
      removableCount: 4,
      confirmLabel: "remove from 4 · 2 lose local edits →",
    },
  },
};

export const CannotBeRemoved: Story = {
  args: {
    view: {
      kind: "grouped",
      clean: {
        label: "3 targets without local edits",
        message: "Only the deployed files are removed.",
      },
      cost: [],
      refused: [
        { label: "/dev/legacy-etl", reason: "Repository not registered" },
        { label: "/dev/acme-web", reason: "Local changes in deployed files" },
      ],
      refusedNote: LOCAL_CHANGES_NEXT_STEP,
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
      kind: "report",
      heading: "Removed from 4 targets",
      removed: ["global", "/dev/acme-web", "/dev/acme-api", "/dev/legacy-etl"],
      leftAlone: [],
      refusedNote: null,
      failedNote: null,
    },
  },
};

export const ReportPartial: Story = {
  args: {
    report: {
      kind: "report",
      heading: "Removed from 2 of 4 targets",
      removed: ["global", "/dev/acme-web"],
      leftAlone: [
        {
          label: "/dev/acme-api",
          outcome: "failed",
          reason: "Target busy — still there",
        },
        {
          label: "/dev/legacy-etl",
          outcome: "refused",
          reason: "Local changes in deployed files",
        },
      ],
      refusedNote: LOCAL_CHANGES_NEXT_STEP,
      failedNote: null,
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
