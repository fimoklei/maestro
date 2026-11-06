import type { Meta, StoryObj } from "@storybook/react-vite";
import { RadioGroup } from "./radio-group";

const meta = {
  title: "Shell/RadioGroup",
  component: RadioGroup,
  decorators: [
    (Story) => (
      <div className="w-[576px]">
        <Story />
      </div>
    ),
  ],
  args: {
    label: "Copy to import",
    options: ["~/.claude/skills/code-review", "~/.agents/skills/code-review"],
    onChange: () => {},
    disabled: false,
    firstRadio: null,
  },
} satisfies Meta<typeof RadioGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

export const NoneSelected: Story = { args: { value: null } };

export const Selected: Story = {
  args: { value: "~/.agents/skills/code-review" },
};
