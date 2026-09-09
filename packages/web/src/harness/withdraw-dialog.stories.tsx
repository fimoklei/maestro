import type { Meta, StoryObj } from "@storybook/react-vite";
import { WithdrawDialog } from "./withdraw-dialog";

const meta = {
  title: "Harness/WithdrawDialog",
  component: WithdrawDialog,
  args: {
    skill: "code-review",
    number: 45,
    onClose: () => {},
    onConfirm: () => {},
    withdrawing: false,
    withdrawError: null,
  },
} satisfies Meta<typeof WithdrawDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Ready: Story = {};

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
      message: "Select Retry check to read what GitHub holds now.",
      detail: "This pull request is no longer the one open over this skill.",
    },
  },
};
