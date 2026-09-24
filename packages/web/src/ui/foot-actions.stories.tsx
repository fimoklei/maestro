import type { Meta, StoryObj } from "@storybook/react-vite";
import { FootActions } from "./foot-actions";

const meta = {
  title: "Core/FootActions",
  component: FootActions,
  args: {
    items: [
      { label: "Deploy skill", onSelect: () => {} },
      { label: "Remove from all 3 targets", danger: true, onSelect: () => {} },
    ],
  },
  decorators: [
    (Story) => (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, maxWidth: 360 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FootActions>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

// A standing operation leads; a blocked item stays, with its cause.
export const StandingOperation: Story = {
  args: {
    items: [
      { label: "Retry update", onSelect: () => {} },
      { label: "Deploy skill", onSelect: () => {} },
      {
        label: "Update target — unfinished operation",
        disabled: true,
        onSelect: () => {},
      },
    ],
  },
};
