import type { Meta, StoryObj } from "@storybook/react-vite";
import { MachineValue } from "./machine-value";

const meta = {
  title: "Core/MachineValue",
  component: MachineValue,
  args: { children: "v1.4.0" },
} satisfies Meta<typeof MachineValue>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Version: Story = {};

// Only the machine value changes face; the sentence around it stays Geist.
export const InASentence: Story = {
  render: () => (
    <p>
      Global · release <MachineValue>v1.4.0</MachineValue>
    </p>
  ),
};
