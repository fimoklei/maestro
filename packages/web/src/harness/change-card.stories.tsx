import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChangeCard } from "./change-card";
import { stageRow } from "./stage-row-fixture";

const meta = {
  title: "Harness/ChangeCard",
  component: ChangeCard,
  args: {
    row: stageRow("pending-proposal", "release-notes", "not-yet-proposed", {
      change: "addition",
    }),
    context: {
      defaultBranch: "main",
      releasedVersion: "v2.0.0",
      origin: "github.com/fimoklei/agent-harness",
    },
  },
} satisfies Meta<typeof ChangeCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Addition: Story = {};

export const Rename: Story = {
  args: {
    row: stageRow("pending-release", "research", "not-yet-released", {
      change: "rename",
      previousName: "explore",
    }),
  },
};
