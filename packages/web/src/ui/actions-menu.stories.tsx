import type { Meta, StoryObj } from "@storybook/react-vite";
import { ActionsMenu } from "./actions-menu";

const meta = {
  title: "Core/ActionsMenu",
  component: ActionsMenu,
  args: {
    label: "Actions for tdd",
    items: [{ label: "remove…", onSelect: () => {} }],
  },
} satisfies Meta<typeof ActionsMenu>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SeveralActions: Story = {
  args: {
    items: [
      { label: "remove…", onSelect: () => {} },
      { label: "copy ref", onSelect: () => {} },
      { label: "open source", onSelect: () => {}, disabled: true },
    ],
  },
};

// Nothing to act on yet: the trigger keeps its place in the row and states its
// own inertness, rather than opening onto an empty box.
export const NoActions: Story = {
  args: { items: [] },
};
