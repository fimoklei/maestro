import type { Meta, StoryObj } from "@storybook/react-vite";
import { InlineMachineValue } from "./inline-machine-value";

const meta = {
  title: "Core/InlineMachineValue",
  component: InlineMachineValue,
  args: { children: "rm ~/.claude/skills/tdd" },
} satisfies Meta<typeof InlineMachineValue>;

export default meta;

type Story = StoryObj<typeof meta>;

export const InASentence: Story = {
  render: (args) => (
    <p className="text-gray-11">
      Run <InlineMachineValue {...args} />, then deploy again.
    </p>
  ),
};
