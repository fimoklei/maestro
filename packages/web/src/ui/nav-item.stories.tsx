import type { Meta, StoryObj } from "@storybook/react-vite";
import { NavItem } from "./nav-item";

const meta = {
  title: "Shell/NavItem",
  component: NavItem,
  args: { label: "Inventory", icon: "▤", active: false },
} satisfies Meta<typeof NavItem>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Inactive: Story = {};

export const Active: Story = { args: { active: true } };

export const Sidebar: Story = {
  render: () => (
    <div
      style={{ width: 208, display: "flex", flexDirection: "column", gap: 2 }}
    >
      <NavItem icon="▤" label="Inventory" active />
      <NavItem icon="⇶" label="Deploy-state" />
      <NavItem icon="⧉" label="Compose" />
    </div>
  ),
};
