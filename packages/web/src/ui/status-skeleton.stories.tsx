import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatusSkeleton } from "./status-skeleton";

const meta = {
  title: "Core/StatusSkeleton",
  component: StatusSkeleton,
} satisfies Meta<typeof StatusSkeleton>;

export default meta;

type Story = StoryObj<typeof meta>;

// The placeholder appears 1.3 s after the story opens.
export const Reading: Story = {};
