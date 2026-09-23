import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card } from "./card";
import { StatusBadge } from "./status-badge";
import { reading } from "./status-reading";

const meta = {
  title: "Shell/Card",
  component: Card,
  args: { padded: true },
  argTypes: {
    kind: { control: "inline-radio", options: [undefined, "global", "local"] },
  },
} satisfies Meta<typeof Card>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Plain: Story = {
  args: { children: "a plain container, no header" },
};

export const WithHeader: Story = {
  args: {
    title: "Claude Code",
    kind: "global",
    status: <StatusBadge reading={reading("In sync", "good")} />,
    children: "deployed primitives go here",
  },
};

export const Drift: Story = {
  args: {
    title: "~/dev/acme-web",
    kind: "local",
    drift: true,
    status: <StatusBadge reading={reading("Local edits", "attention")} />,
    children: "a target whose contents drift warms its outline",
  },
};
