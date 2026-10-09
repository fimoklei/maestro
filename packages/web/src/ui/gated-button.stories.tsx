import type { Meta, StoryObj } from "@storybook/react-vite";
import { GatedButton } from "./gated-button";

const meta = {
  title: "Core/GatedButton",
  component: GatedButton,
  args: {
    variant: "primary",
    label: "Create a release",
    unavailable: "GitHub not read",
  },
} satisfies Meta<typeof GatedButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Unavailable: Story = {};

export const Available: Story = { args: { unavailable: null } };
