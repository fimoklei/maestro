import type { Meta, StoryObj } from "@storybook/react-vite";
import { WritesToList } from "./writes-to-list";

const meta = {
  title: "DeployState/WritesToList",
  component: WritesToList,
  args: {
    folders: [
      { path: "~/.claude/skills", tool: "claude", detected: true },
      { path: "~/.agents/skills", tool: "codex", detected: true },
    ],
  },
} satisfies Meta<typeof WritesToList>;
export default meta;

type Story = StoryObj<typeof meta>;

export const BothDetected: Story = {};

export const ToolNotDetected: Story = {
  args: {
    folders: [
      { path: "~/.claude/skills", tool: "claude", detected: true },
      { path: "~/.agents/skills", tool: "codex", detected: false },
    ],
  },
};
