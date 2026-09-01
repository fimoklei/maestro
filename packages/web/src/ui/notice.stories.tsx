import type { Meta, StoryObj } from "@storybook/react-vite";
import { Notice } from "./notice";

const meta = {
  title: "UI/Notice",
  component: Notice,
  args: {
    trigger: "user-action",
  },
} satisfies Meta<typeof Notice>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Info: Story = {
  args: {
    notice: {
      level: "info",
      label: "no global tools detected",
      message: "Install Claude Code or Codex to deploy skills globally.",
    },
  },
};

export const Success: Story = {
  args: {
    notice: {
      level: "success",
      label: "deployed",
      message: "tdd v0.5.0 is now in Claude Code and Codex.",
    },
  },
};

// The one level where the consequence is a required prop.
export const Warning: Story = {
  args: {
    notice: {
      level: "warning",
      label: "the deployed copy has local edits",
      message: "Removing it deletes those edits.",
      action: { label: "remove anyway →", onClick: () => {} },
    },
  },
};

export const ErrorLevel: Story = {
  args: {
    notice: {
      level: "error",
      label: "the run never started",
      message: "Malformed request. Nothing was removed anywhere.",
    },
  },
};

export const WithAction: Story = {
  args: {
    notice: {
      level: "error",
      label: "the removal failed",
      message: "apm did not confirm the removal.",
      detail: "retry removes only what is left",
      action: { label: "retry →", onClick: () => {} },
    },
  },
};
