import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReleaseWithdrawalDialog } from "./release-withdrawal-dialog";

const CODE_REVIEW = {
  type: "skill",
  name: "code-review",
  path: ".apm/skills/code-review",
  change: "edit",
  previousName: null,
  mergedRequest: null,
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
      mergedRequest: null,
    },
  },
};

const CATEGORIES = {
  type: "categories",
  name: "Categories",
  path: ".maestro/categories.yml",
  change: "edit",
  previousName: null,
  mergedRequest: 45,
} as const;

export const Categories: Story = {
  args: { target: CATEGORIES },
};

export const CategoriesNotInLatestRelease: Story = {
  args: { target: { ...CATEGORIES, change: "addition" } },
};

export const CategoriesBlocked: Story = {
  args: {
    target: CATEGORIES,
    check: {
      kind: "refused",
      notice: {
        level: "error",
        label: "Withdrawal blocked",
        message:
          "Nothing was withdrawn. Merge or close pull request #46 on GitHub.",
      },
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

export const DirectPushRefused: Story = {
  args: {
    withdrawError: {
      level: "error",
      label: "Direct push refused",
      message:
        "Nothing was withdrawn. Allow direct pushes to the default branch on GitHub, then select Withdraw from release again.",
      detail: "A rule on GitHub blocked the push.",
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

export const CategoriesFileDeleted: Story = {
  args: { target: { ...CATEGORIES, change: "deletion" } },
};
