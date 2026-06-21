import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card } from "./card";
import { Chip } from "./chip";

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
    status: <Chip tone="ok">● in sync</Chip>,
    children: "deployed primitives go here",
  },
};

export const Drift: Story = {
  args: {
    title: "~/dev/acme-web",
    kind: "local",
    drift: true,
    status: <Chip tone="drift">▲ 2 drift</Chip>,
    children: "a target whose contents drift warms its outline",
  },
};
