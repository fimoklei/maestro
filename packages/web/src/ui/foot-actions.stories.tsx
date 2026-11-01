import type { Meta, StoryObj } from "@storybook/react-vite";
import { FootActions } from "./foot-actions";

const meta = {
  title: "Core/FootActions",
  component: FootActions,
  args: {
    name: "pr-review",
    items: [
      { label: "Copy prompt", onSelect: () => {} },
      { label: "Edit prompt", edit: true, onSelect: () => {} },
      { label: "Set category", onSelect: () => {} },
      { label: "Delete prompt", danger: true, onSelect: () => {} },
    ],
    primary: "Copy prompt",
  },
  decorators: [
    (Story) => (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, width: 360 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FootActions>;

export default meta;

type Story = StoryObj<typeof meta>;

// The primary and the edit item; Set category and Delete prompt behind the ⋯.
export const Default: Story = {};

// No primary and no edit item: the foot is the ⋯ alone.
export const NoPrimary: Story = {
  args: {
    name: "tdd",
    items: [
      { label: "Import local edits", onSelect: () => {} },
      { label: "Deploy skill", onSelect: () => {} },
    ],
    primary: null,
  },
};

// Propose change's write is running; its row's other presses wait.
export const Busy: Story = {
  args: {
    name: "tdd",
    items: [
      { label: "Propose change", busy: "propose", disabled: true },
      { label: "Discard change", danger: true, disabled: true },
    ],
    primary: null,
  },
};

// A blocked item with a cause stays a button: its tooltip states why.
export const BlockedWithCause: Story = {
  args: {
    name: "tdd",
    items: [
      { label: "View pull request", href: "https://github.com/o/r/pull/52" },
      {
        label: "Withdraw from release",
        danger: true,
        disabled: true,
        cause: "Merge pull request #52 on GitHub, or select Withdraw proposal.",
      },
    ],
    primary: null,
  },
};
