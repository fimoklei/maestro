import type { Meta, StoryObj } from "@storybook/react-vite";
import { PinnedPerSkillHead } from "./pinned-per-skill-head";

const meta = {
  title: "DeployState/PinnedPerSkillHead",
  component: PinnedPerSkillHead,
  args: { pinned: [{ release: "v0.3.1", skills: 3 }] },
} satisfies Meta<typeof PinnedPerSkillHead>;
export default meta;

type Story = StoryObj<typeof meta>;

export const OneTag: Story = {};

export const DisagreeingTags: Story = {
  args: {
    pinned: [
      { release: "v0.3.1", skills: 3 },
      { release: "v0.3.0", skills: 1 },
    ],
  },
};
