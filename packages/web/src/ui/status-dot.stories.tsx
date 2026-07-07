import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatusDot } from "./status-dot";

const meta = {
  title: "Core/StatusDot",
  component: StatusDot,
  args: { status: "ok", size: 6 },
  argTypes: {
    status: { control: "inline-radio", options: ["ok", "drift", "muted"] },
  },
} satisfies Meta<typeof StatusDot>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Ok: Story = {};

export const Drift: Story = { args: { status: "drift" } };

export const Muted: Story = { args: { status: "muted" } };

export const InContext: Story = {
  render: () => (
    <span
      className="font-mono text-data text-fg"
      style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
    >
      <StatusDot status="ok" /> in sync
    </span>
  ),
};
