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

// The button keeps its label; its tooltip states the cause.
export const Unavailable: Story = {
  args: { unavailable: "Status out of date" },
};
