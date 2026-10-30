import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReleaseWithdrawalDialog } from "./release-withdrawal-dialog";

const CODE_REVIEW = {
  type: "skill",
  name: "code-review",
  path: ".apm/skills/code-review",
  change: "edit",
  previousName: null,
} as const;

const meta = {
  title: "Harness/ReleaseWithdrawalDialog",
  component: ReleaseWithdrawalDialog,
  args: {
    target: CODE_REVIEW,
    check: { kind: "read" },
    onClose: () => {},
    onConfirm: () => {},
    withdrawing: false,
    withdrawError: null,
  },
} satisfies Meta<typeof ReleaseWithdrawalDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Ready: Story = {};

export const Checking: Story = {
  args: { check: { kind: "checking" } },
};

export const Renamed: Story = {
  args: {
    target: { ...CODE_REVIEW, change: "rename", previousName: "review" },
  },
};

export const Added: Story = {
  args: { target: { ...CODE_REVIEW, change: "addition" } },
};

export const DeletedPrompt: Story = {
  args: {
    target: {
      type: "prompt",
      name: "pr-review",
      path: ".maestro/prompts/pr-review.md",
      change: "deletion",
      previousName: null,
    },
  },
};

export const CloneNotUpToDate: Story = {
  args: {
    withdrawError: {
      level: "error",
      label: "Clone not up to date",
      message:
        "Nothing was withdrawn. Sync your clone with GitHub, then select Withdraw from release again.",
      detail: "Your clone's last commit is not the one on GitHub.",
    },
  },
};

export const Withdrawing: Story = {
  args: { withdrawing: true },
};

export const ConfirmationOutOfDate: Story = {
  args: {
    withdrawError: {
      level: "error",
      label: "Confirmation out of date",
      message:
        "Nothing was withdrawn. Select Re-read Harness, then select Withdraw from release again.",
      detail: "GitHub changed after this confirmation.",
    },
  },
};
