import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatusBadge } from "./status-badge";
import { reading } from "./status-reading";

const meta = {
  title: "Core/StatusBadge",
  component: StatusBadge,
  args: { reading: reading("Behind", "attention") },
} satisfies Meta<typeof StatusBadge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Attention: Story = {};

// One per family.
export const EveryFamily: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <StatusBadge reading={reading("Up to date", "good")} />
      <StatusBadge reading={reading("Behind", "attention")} />
      <StatusBadge reading={reading("Failed", "failed")} />
      <StatusBadge reading={reading("Unknown", "unknown")} />
      <StatusBadge reading={reading("Not deployed", "neutral")} />
    </div>
  ),
};
