import type { Meta, StoryObj } from "@storybook/react-vite";
import { CategoryField } from "./category-field";

// The Category field of Import skill and Import prompt, closed. The open menu
// is `Core/CategoryMenu`; the field reads the categories when it opens.
const meta = {
  title: "Harness/CategoryField",
  component: CategoryField,
  args: {
    field: {
      value: null,
      hint: "Only you see this category.",
      suggested: null,
      onPick: () => {},
    },
    disabled: false,
  },
  decorators: [
    (Story) => (
      <div style={{ width: 448 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CategoryField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const NoCategory: Story = {};

/** SKILL.md named a category that exists. */
export const TakenFromFile: Story = {
  args: {
    field: {
      value: "Code review",
      hint: "Taken from SKILL.md.",
      suggested: null,
      onPick: () => {},
    },
  },
};

/** Locked while the import runs. */
export const Importing: Story = { args: { disabled: true } };
