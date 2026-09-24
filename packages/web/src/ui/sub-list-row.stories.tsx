import type { Meta, StoryObj } from "@storybook/react-vite";
import { reading } from "./status-reading";
import { SubListRow } from "./sub-list-row";

const meta = {
  title: "Core/SubListRow",
  component: SubListRow,
  args: {
    mark: reading("In sync", "good"),
    name: "Claude Code",
    value: "v1.4.0",
    menuLabel: "Actions for Claude Code",
    items: [
      { label: "Show in Deploy-state", onSelect: () => {} },
      { label: "Remove from target", danger: true, onSelect: () => {} },
    ],
  },
  decorators: [
    (Story) => (
      <ul style={{ maxWidth: 328, listStyle: "none", margin: 0, padding: 0 }}>
        <Story />
      </ul>
    ),
  ],
} satisfies Meta<typeof SubListRow>;

export default meta;

type Story = StoryObj<typeof meta>;

export const InSync: Story = {};

export const Behind: Story = {
  args: {
    mark: { ...reading("Behind", "attention"), hint: "v1.4.0 is released." },
    name: "Codex",
    value: "v1.3.2",
    menuLabel: "Actions for Codex",
    items: [
      { label: "Update target", onSelect: () => {} },
      { label: "Remove from target", danger: true, onSelect: () => {} },
    ],
  },
};

// No status before the server answers: the row carries no mark.
export const Unread: Story = {
  args: { mark: null },
};
