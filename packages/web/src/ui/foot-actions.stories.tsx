import type { Meta, StoryObj } from "@storybook/react-vite";
import { FootActions } from "./foot-actions";

const meta = {
  title: "Core/FootActions",
  component: FootActions,
  args: {
    name: "tdd",
    items: [
      { label: "Deploy skill", onSelect: () => {} },
      { label: "Remove from all 3 targets", danger: true, onSelect: () => {} },
    ],
    primary: "Deploy skill",
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

// The danger item sits behind the ⋯ at the foot's right end.
export const Default: Story = {};

// Nothing primary: an In sync target's Deploy skill stays quiet.
export const NoPrimary: Story = {
  args: {
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
    items: [
      { label: "Propose change", busy: "propose", disabled: true },
      { label: "Discard change", danger: true, disabled: true },
    ],
    primary: null,
  },
};
