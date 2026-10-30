import type { Meta, StoryObj } from "@storybook/react-vite";
import { CategoryField } from "./category-field";

const idleAdd = {
  run: async () => null,
  pending: false,
  failed: false,
  reset: () => {},
};

// The Category field of Import skill, Import prompt and Edit prompt, closed.
// The open menu is `Core/CategoryMenu`; the field reads the categories when
// it opens.
const meta = {
  title: "Harness/CategoryField",
  component: CategoryField,
  args: {
    value: null,
    onChange: () => {},
    disabled: false,
    hint: "Only you see this category.",
    suggested: null,
    add: idleAdd,
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
  args: { value: "Code review", hint: "Taken from SKILL.md." },
};

/** Locked while the import runs. */
export const Importing: Story = { args: { disabled: true } };

/** An add refused after a press closed the menu. */
export const AddRefused: Story = {
  args: { add: { ...idleAdd, failed: true } },
};
