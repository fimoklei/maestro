import type { Meta, StoryObj } from "@storybook/react-vite";
import { reading } from "./status-reading";
import { SubListRow, SubListSkeleton, SubListValueRow } from "./sub-list-row";

const meta = {
  title: "Core/SubListRow",
  component: SubListRow,
  args: {
    mark: reading("In sync", "good"),
    name: "Claude Code",
    value: { text: "v1.4.0", machine: true },
    menuLabel: "Actions for Claude Code",
    items: [
      { label: "View Deploy-state", onSelect: () => {} },
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
    value: { text: "v1.3.2", machine: true },
    menuLabel: "Actions for Codex",
    items: [
      { label: "Update target", onSelect: () => {} },
      { label: "Remove from target", danger: true, onSelect: () => {} },
    ],
  },
};

// A long name keeps its width; the folder in place of the version gives way.
export const LongNameAndFolder: Story = {
  args: {
    mark: {
      ...reading("Missing", "attention", "⚠"),
      hint: "No copy in ~/.agents/skills.",
    },
    name: "improve-codebase-architecture",
    value: { text: "~/.agents/skills", machine: true },
    menuLabel: "Actions for improve-codebase-architecture",
  },
};

// No status before the server answers: the row carries no mark.
export const Unread: Story = {
  args: { mark: null },
};

// Rows still being read; the placeholders appear 1.3 s after the story opens.
export const Reading: Story = {
  render: () => <SubListSkeleton rows={2} />,
};

// A read-only row with no menu: a Global folder, its word, and who reads it.
export const ValueWithMeta: Story = {
  render: () => (
    <SubListValueRow
      status={reading("Up to date", "good")}
      value="~/.claude/skills"
      meta="Read by Claude Code, Cursor and OpenCode"
    />
  ),
};

// A folder that deviates, with its counts; the longest realistic readers.
export const ValueWithCounts: Story = {
  render: () => (
    <SubListValueRow
      status={reading("Local edits", "attention", "⚠")}
      value="~/.agents/skills"
      meta="Read by Codex, Copilot CLI, Cursor, Gemini CLI and others · 1 missing · 1 not updated · 2 with local edits"
    />
  ),
};
