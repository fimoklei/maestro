import type { Meta, StoryObj } from "@storybook/react-vite";
import { CategoryMenu } from "./category-menu";

// The one category menu: Set category in a pane or a selection bar, a dialog's
// Category field, and Delete category's Move to.
const meta = {
  title: "Core/CategoryMenu",
  component: CategoryMenu,
  args: {
    label: "Set category for tdd",
    names: ["Code review", "Planning", "Release notes", "Writing"],
    current: "Planning",
    onPick: () => {},
    onAdd: () => {},
    onClose: () => {},
  },
  decorators: [
    (Story) => (
      <div style={{ width: 328 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CategoryMenu>;

export default meta;

type Story = StoryObj<typeof meta>;

export const CurrentCategory: Story = {};

export const NoCategory: Story = { args: { current: null } };

/** Several rows in different categories: nothing carries ✓. */
export const RowsDiffer: Story = {
  args: { label: "Set category for 3 skills", current: undefined },
};

export const EmptyHarness: Story = { args: { names: [], current: null } };

/** Delete category's Move to leaves out the category being deleted. */
export const Excluding: Story = {
  args: { label: "Move to", exclude: "Planning", current: undefined },
};

export const Failed: Story = {
  args: {
    failure: {
      level: "error",
      label: "Category not set",
      message: "The category no longer exists. Choose another category.",
    },
  },
};
