import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReleaseWithdrawalDialog } from "./release-withdrawal-dialog";

const CODE_REVIEW = {
  type: "skill",
  name: "code-review",
  change: "edit",
  previousName: null,
} as const;

const meta = {
  title: "Harness/ReleaseWithdrawalDialog",
  component: ReleaseWithdrawalDialog,
  args: {
    target: CODE_REVIEW,
    check: { kind: "read", files: [] },
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

export const UnproposedChanges: Story = {
  args: {
    check: {
      kind: "read",
      files: [
        ".apm/skills/code-review/SKILL.md",
        ".apm/skills/code-review/references/notes.md",
      ],
    },
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
      change: "deletion",
      previousName: null,
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
      detail:
        "Your clone or the latest release changed after this confirmation.",
    },
  },
};
