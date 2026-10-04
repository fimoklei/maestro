import type { Meta, StoryObj } from "@storybook/react-vite";
import { DiscardDialog } from "./discard-dialog";

const meta = {
  title: "Harness/DiscardDialog",
  component: DiscardDialog,
  args: {
    skill: "code-review",
    folder: ".apm/skills/code-review",
    defaultBranch: "main",
    onClose: () => {},
    onConfirm: () => {},
    discarding: false,
    discardError: null,
  },
} satisfies Meta<typeof DiscardDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Ready: Story = {};

export const Discarding: Story = {
  args: { discarding: true },
};

// A proposal branch appeared after the dialog opened: the edit stays.
export const Refused: Story = {
  args: {
    discardError: {
      level: "error",
      label: "Change already proposed",
      message:
        "Nothing was discarded. Select Re-read Harness to see the skill as it is now.",
      detail: "code-review now has a proposal branch or pull request.",
    },
  },
};
