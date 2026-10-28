import type { Meta, StoryObj } from "@storybook/react-vite";
import { HarnessConfirmation } from "./harness-confirmation";

const meta = {
  title: "Harness/HarnessConfirmation",
  component: HarnessConfirmation,
  args: {
    type: "skill",
    name: "code-review",
    title: "Withdraw code-review from release",
    action: {
      label: "Withdraw from release",
      verb: "withdrawFromRelease",
      unavailable: null,
      run: () => {},
    },
    running: false,
    failure: null,
    changes:
      "This replaces the skill folder in your clone with its copy in the latest release.",
    stays: null,
    facts: [{ label: "Folder", value: ".apm/skills/code-review" }],
    checking: null,
    loadNotice: null,
    onClose: () => {},
  },
} satisfies Meta<typeof HarnessConfirmation>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Ready: Story = {};

export const WhatStays: Story = {
  args: { stays: "Your proposal remains unchanged." },
};

export const Checking: Story = {
  args: {
    action: {
      label: "Withdraw from release",
      verb: "withdrawFromRelease",
      unavailable: "Checking for changes not yet proposed…",
      run: () => {},
    },
    checking: "Checking for changes not yet proposed…",
  },
};

export const LoadNotice: Story = {
  args: {
    loadNotice: {
      level: "warning",
      label: "Changes not yet proposed",
      message:
        "Withdraw from release discards the changes in these files. To keep them, copy them outside your clone first.",
    },
  },
};

export const Running: Story = {
  args: { running: true },
};
