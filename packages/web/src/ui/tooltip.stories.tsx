import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import { Tooltip } from "./tooltip";

const meta = {
  title: "Core/Tooltip",
  component: Tooltip,
  args: {
    label: "Re-read Inventory",
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
    detail:
      "Files changed after deployment. The latest release lacks these changes. Select Import local edits to bring them into the Harness.",
    children: <Button variant="quiet">Local edits</Button>,
  },
};
