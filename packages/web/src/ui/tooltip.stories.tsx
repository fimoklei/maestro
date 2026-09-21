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
