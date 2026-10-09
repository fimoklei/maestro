import type { Meta, StoryObj } from "@storybook/react-vite";
import { SubListHeading } from "./sub-list-heading";

const meta = {
  title: "Core/SubListHeading",
  component: SubListHeading,
  args: { label: "Deployed to", count: 3, headingRef: null },
} satisfies Meta<typeof SubListHeading>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Counted: Story = {};

// Not every target has answered: no count yet.
export const Reading: Story = { args: { count: null } };
