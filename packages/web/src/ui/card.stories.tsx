import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card } from "./card";

const meta = {
  title: "Shell/Card",
  component: Card,
  args: { padded: true },
} satisfies Meta<typeof Card>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Plain: Story = {
  args: { children: "a plain container" },
};

export const Drift: Story = {
  args: {
    drift: true,
    children: "a container whose contents drift warms its outline",
  },
};
