import type { Meta, StoryObj } from "@storybook/react-vite";
import { GatedButton } from "./gated-button";

const meta = {
  title: "Core/GatedButton",
  component: GatedButton,
  args: {
    variant: "primary",
    label: "Create a release",
    unavailable: null,
  },
} satisfies Meta<typeof GatedButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Available: Story = {};

// The cause is visible text beside the button; the button keeps its label.
export const Unavailable: Story = {
  args: { unavailable: { describedBy: "gated-button-cause" } },
  render: (args) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p id="gated-button-cause" className="m-0 text-gray-11 text-meta">
        Status out of date
      </p>
      <div>
        <GatedButton {...args} />
      </div>
    </div>
  ),
};
