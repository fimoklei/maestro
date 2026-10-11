import type { Meta, StoryObj } from "@storybook/react-vite";
import { BandFact } from "./band-fact";

const meta = {
  title: "Core/BandFact",
  component: BandFact,
  args: { label: "Branch", value: "main", machine: true },
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
  args: { label: "Released", value: "Not released yet", machine: false },
};

export const Linked: Story = {
  args: {
    label: "Origin",
    value: "github.com/fimoklei/agent-harness",
    github: { kind: "link", url: "https://github.com/fimoklei/agent-harness" },
  },
};
