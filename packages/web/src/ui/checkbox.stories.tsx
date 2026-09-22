import type { Meta, StoryObj } from "@storybook/react-vite";
import { Checkbox } from "./checkbox";

const meta = {
  title: "Core/Checkbox",
  component: Checkbox,
  args: { "aria-label": "Select tdd for bulk deploy" },
} satisfies Meta<typeof Checkbox>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Unchecked: Story = {};

export const Checked: Story = { args: { checked: true } };

// The header's box while some, not all, shown rows are chosen.
export const Indeterminate: Story = {
  args: {
    checked: "indeterminate",
    "aria-label": "Select all for bulk deploy",
  },
};

export const Disabled: Story = { args: { disabled: true } };
