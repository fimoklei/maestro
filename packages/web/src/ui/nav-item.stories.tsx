import type { Meta, StoryObj } from "@storybook/react-vite";
import { FileText, LayoutList, Table2 } from "lucide-react";
import { NavItem } from "./nav-item";

const ICON = { size: 16, strokeWidth: 1.5 } as const;

const meta = {
  title: "Shell/NavItem",
  component: NavItem,
  args: { label: "Inventory", icon: <Table2 {...ICON} />, active: false },
} satisfies Meta<typeof NavItem>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Inactive: Story = {};

export const Active: Story = { args: { active: true } };

export const Sidebar: Story = {
  render: () => (
    <div
      style={{ width: 220, display: "flex", flexDirection: "column", gap: 2 }}
    >
      <NavItem icon={<LayoutList {...ICON} />} label="Deploy-state" active />
      <NavItem icon={<Table2 {...ICON} />} label="Inventory" />
      <NavItem icon={<FileText {...ICON} />} label="Repositories" />
    </div>
  ),
};
