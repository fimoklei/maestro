import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArrowUpRight, FolderGit2 } from "lucide-react";
import { Icon } from "./icon";

const meta = {
  title: "Core/Icon",
  component: Icon,
  args: { of: FolderGit2 },
} satisfies Meta<typeof Icon>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Standard: Story = {};

export const Small: Story = { args: { of: ArrowUpRight, small: true } };
