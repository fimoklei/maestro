import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatusLine } from "./status-line";

const meta = {
  title: "Core/StatusLine",
  component: StatusLine,
  args: {
    children: "Cloning can take a minute.",
  },
} satisfies Meta<typeof StatusLine>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Connecting: Story = {};
