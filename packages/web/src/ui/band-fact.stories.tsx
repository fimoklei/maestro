import type { Meta, StoryObj } from "@storybook/react-vite";
import { GitBranch, Tag } from "lucide-react";
import { BandFact } from "./band-fact";
import { GitHubMark } from "./github-mark-link";
import { Icon } from "./icon";

const meta = {
  title: "Core/BandFact",
  component: BandFact,
  args: {
    label: "Branch",
    value: "main",
    icon: <Icon of={GitBranch} />,
    machine: true,
  },
  decorators: [
    (Story) => (
      <dl className="m-0 flex items-center text-row">
        <Story />
      </dl>
    ),
  ],
} satisfies Meta<typeof BandFact>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Machine: Story = {};

export const PlainWord: Story = {
  args: {
    label: "Release",
    value: "Not released yet",
    icon: <Icon of={Tag} />,
    machine: false,
  },
};

export const Linked: Story = {
  args: {
    label: "Origin",
    icon: <GitHubMark />,
    value: "github.com/fimoklei/agent-harness",
    github: { kind: "link", url: "https://github.com/fimoklei/agent-harness" },
  },
};
