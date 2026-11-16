import type { Meta, StoryObj } from "@storybook/react-vite";
import { NavItem } from "./nav-item";
import { SignalDot } from "./signal-dot";

const meta = {
  title: "Core/SignalDot",
  component: SignalDot,
  args: { id: "signal", text: "Harness categories have changed" },
} satisfies Meta<typeof SignalDot>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Alone: Story = {};

// Where it sits: after a navigation row's label.
export const OnANavItem: Story = {
  render: (args) => (
    <div style={{ width: 244 }}>
      <NavItem label="Categories" signal={args.text} />
    </div>
  ),
};
