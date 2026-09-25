import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import { Field } from "./field";

const meta = {
  title: "Shell/Field",
  component: Field,
  args: {
    label: "Folder path",
    value: "/Users/me/Projects/maestro",
    onChange: () => {},
  },
  decorators: [
    (Story) => (
      <div className="w-[420px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Field>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithHint: Story = {
  args: { hint: "Maestro reads this folder. It never writes to it." },
};

// One ✕ line under the field, shown once the field has been judged.
export const Refused: Story = {
  args: {
    value: "/Users/me/Projects/scratch",
    error: "Not a Git repository. Register a valid repository.",
  },
};

// A control beside the field, such as the system folder chooser.
export const WithBrowse: Story = {
  args: {
    trailing: (
      <Button variant="quiet" size="md">
        Browse
      </Button>
    ),
  },
};
