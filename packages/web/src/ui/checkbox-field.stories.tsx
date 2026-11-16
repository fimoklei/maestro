import type { Meta, StoryObj } from "@storybook/react-vite";
import { CheckboxField } from "./checkbox-field";

const meta = {
  title: "Core/CheckboxField",
  component: CheckboxField,
  args: {
    label: "Copy Harness categories",
    hint: "You can also copy them later in Categories in Settings.",
    checked: true,
    onChange: () => {},
  },
} satisfies Meta<typeof CheckboxField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Checked: Story = {};

export const Unchecked: Story = { args: { checked: false } };

// A write that reads the choice is running.
export const Disabled: Story = { args: { disabled: true } };
