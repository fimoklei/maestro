import type { Meta, StoryObj } from "@storybook/react-vite";
import { WithdrawDialog } from "./withdraw-dialog";

const meta = {
  title: "Harness/WithdrawDialog",
  component: WithdrawDialog,
  args: {
    type: "skill",
    name: "code-review",
    branch: "maestro/code-review",
    number: 45,
    unproposed: { kind: "read", files: [] },
    onClose: () => {},
    onConfirm: () => {},
    withdrawing: false,
    withdrawError: null,
  },
} satisfies Meta<typeof WithdrawDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Ready: Story = {};

export const Checking: Story = {
  args: { unproposed: { kind: "checking" } },
};

export const UnproposedChanges: Story = {
  args: {
    unproposed: { kind: "read", files: ["SKILL.md", "references/notes.md"] },
  },
};

export const CheckFailed: Story = {
  args: { unproposed: { kind: "failed" } },
};

export const Prompt: Story = {
  args: {
    type: "prompt",
    name: "pr-review",
    branch: "maestro/prompt.pr-review",
  },
};

// Proposal closed or Pull request missing: nothing to close, only the branch
// goes (#1639).
export const NoOpenPullRequest: Story = {
  args: { number: null },
};

export const Withdrawing: Story = {
  args: { withdrawing: true },
};

// GitHub moved under the confirmation: the request the row named is no longer
// the open one, so nothing was closed and the dialog stays.
export const RequestMovedOn: Story = {
  args: {
    withdrawError: {
      level: "error",
      label: "Pull request moved on",
      message: "Select Re-read Harness to read what GitHub holds now.",
      detail: "This pull request is no longer the one open over this skill.",
    },
  },
};
