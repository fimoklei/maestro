import type { Meta, StoryObj } from "@storybook/react-vite";
import { InlineMachineValue } from "./inline-machine-value";
import { InlineName } from "./inline-name";

const meta = {
  title: "Core/InlineName",
  component: InlineName,
  args: { children: "tdd" },
} satisfies Meta<typeof InlineName>;

export default meta;

type Story = StoryObj<typeof meta>;

// The name carries weight and ink; the sentence around it stays regular gray 11.
export const InASentence: Story = {
  render: (args) => (
    <p className="text-gray-11">
      <InlineName {...args} /> has local edits. This update replaces them with
      release <InlineMachineValue>v0.3.4</InlineMachineValue>.
    </p>
  ),
};
