import type { Meta, StoryObj } from "@storybook/react-vite";
import { OptionRadios } from "./option-radios";

const meta = {
  title: "Shell/OptionRadios",
  component: OptionRadios,
  decorators: [
    (Story) => (
      <div className="w-[432px]">
        <Story />
      </div>
    ),
  ],
  args: {
    options: [
      {
        value: "add",
        label: "Add",
        description:
          "Adds the categories you don't have and gives each skill or prompt without a category its Harness category.",
      },
      {
        value: "replace",
        label: "Replace",
        description:
          "Deletes the categories only you have. Every skill and prompt gets its Harness category, or none.",
      },
    ],
    value: "add",
    onChange: () => {},
    disabled: false,
  },
} satisfies Meta<typeof OptionRadios>;

export default meta;

type Story = StoryObj<typeof meta>;

export const FirstSelected: Story = {};

export const Locked: Story = { args: { value: "replace", disabled: true } };
