import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import { machine, phrase } from "./phrase";
import { Tooltip } from "./tooltip";

const meta = {
  title: "Core/Tooltip",
  component: Tooltip,
  args: {
    label: "Re-read Skills",
    children: <Button variant="quiet">Re-read</Button>,
  },
} satisfies Meta<typeof Tooltip>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

// A status mark: its word, then the reason behind it.
export const WithDetail: Story = {
  args: {
    label: "Local edits",
    detail: "Files changed after deployment.",
    children: <Button variant="quiet">Local edits</Button>,
  },
};

export const WithMachineValue: Story = {
  args: {
    label: "Missing",
    detail: phrase`No copy in ${machine("~/.agents/skills")}.`,
    children: <Button variant="quiet">Missing</Button>,
  },
};
