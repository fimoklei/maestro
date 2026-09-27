import type { Meta, StoryObj } from "@storybook/react-vite";
import { Dialog } from "./dialog";

const meta = {
  title: "Shell/Dialog",
  component: Dialog,
  args: {
    title: "Update target",
    version: null,
    width: 480,
    phase: "idle",
    action: {
      label: "Update target",
      verb: "update",
      tone: "primary",
      unavailable: null,
      onRun: () => {},
    },
    failure: null,
    describedBy: null,
    fieldsChanged: false,
    onClose: () => {},
    children: <p className="m-0">The target moves to the latest release.</p>,
  },
} satisfies Meta<typeof Dialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Idle: Story = {};

// Focus opens on Cancel, so Enter never confirms by accident.
export const Destructive: Story = {
  args: {
    title: "Remove tdd",
    version: "v1.2.0",
    action: {
      label: "Remove skill",
      verb: "remove",
      tone: "danger",
      unavailable: null,
      onRun: () => {},
    },
  },
};

export const Running: Story = {
  args: { phase: "running" },
};

export const Unavailable: Story = {
  args: {
    action: {
      label: "Update target",
      verb: "update",
      tone: "primary",
      unavailable: "consent still needed",
      onRun: () => {},
    },
  },
};

export const Failure: Story = {
  args: {
    failure: {
      level: "error",
      label: "Target not updated",
      message: "Nothing changed. Select Update target to try again.",
    },
  },
};

// Once an outcome shows and nothing is left to run, Close is the one step.
export const Outcome: Story = {
  args: { width: 640, phase: "outcome", action: null },
};
