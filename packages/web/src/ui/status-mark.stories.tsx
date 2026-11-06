import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatusMark } from "./status-mark";
import { reading } from "./status-reading";

const meta = {
  title: "Core/StatusMark",
  component: StatusMark,
  args: { reading: reading("Behind", "attention") },
} satisfies Meta<typeof StatusMark>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Attention: Story = {};

// One per family.
export const EveryFamily: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
      <StatusMark reading={reading("In sync", "good")} />
      <StatusMark reading={reading("Behind", "attention")} />
      <StatusMark reading={reading("Failed", "failed")} />
      <StatusMark reading={reading("Unknown", "unknown")} />
      <StatusMark reading={reading("Empty", "neutral")} />
    </div>
  ),
};
