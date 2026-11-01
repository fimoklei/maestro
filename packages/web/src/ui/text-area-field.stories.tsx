import type { Meta, StoryObj } from "@storybook/react-vite";
import { SegmentedControl } from "./segmented-control";
import { TextAreaField } from "./text-area-field";

const meta = {
  title: "Shell/TextAreaField",
  component: TextAreaField,
  args: {
    label: "Prompt text",
    hint: "Saved exactly as you enter it.",
    value: "Review $ARGUMENTS.\nList the risks first.\n",
    onChange: () => {},
  },
  decorators: [
    (Story) => (
      <div className="w-[420px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TextAreaField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

// A switch in the label's place; the box takes the selected word as its name.
export const WithSwitch: Story = {
  args: {
    label: {
      name: "Prompt text",
      control: (
        <SegmentedControl
          label="Prompt text or example"
          segments={[
            { value: "text", label: "Prompt text" },
            { value: "example", label: "Example" },
          ]}
          value="text"
          onChange={() => {}}
          className="self-start"
        />
      ),
    },
  },
};

// One ✕ line under the text area, shown once the form has been submitted.
export const Refused: Story = {
  args: { value: "", error: "Enter the prompt text." },
};
