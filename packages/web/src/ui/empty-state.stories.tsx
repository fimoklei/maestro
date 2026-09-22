import type { Meta, StoryObj } from "@storybook/react-vite";
import { GitPullRequestArrow } from "lucide-react";
import { Button } from "./button";
import { EmptyState } from "./empty-state";

const meta = {
  title: "Core/EmptyState",
  component: EmptyState,
  args: {
    title: "No changes yet",
    body: "Skills you import or edit in your clone will appear here.",
    icon: (
      <GitPullRequestArrow
        aria-hidden="true"
        strokeWidth={1.5}
        className="size-4"
      />
    ),
    action: <Button variant="quiet">Import skill…</Button>,
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
