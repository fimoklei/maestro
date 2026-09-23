import type { Meta, StoryObj } from "@storybook/react-vite";
import { FolderGit2 } from "lucide-react";
import { Button } from "./button";
import { EmptyState } from "./empty-state";

const meta = {
  title: "Core/EmptyState",
  component: EmptyState,
  args: {
    headingLevel: 2,
    title: "No repositories yet",
    description:
      "The repositories you deploy skills to appear here, with the state of each folder.",
    icon: <FolderGit2 strokeWidth={1.5} className="size-4" />,
    action: <Button>Register repository</Button>,
  },
} satisfies Meta<typeof EmptyState>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WithAction: Story = {};

export const WithoutAction: Story = { args: { action: undefined } };
