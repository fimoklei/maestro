import type { Meta, StoryObj } from "@storybook/react-vite";
import { DeleteCategoryDialog } from "./delete-category-dialog";

const idleAdd = {
  run: async () => null,
  pending: false,
  failed: false,
  reset: () => {},
};

// Move to opens the category menu, which reads the list; its story is
// `Core/CategoryMenu`.
const meta = {
  title: "Settings/DeleteCategoryDialog",
  component: DeleteCategoryDialog,
  args: {
    category: { name: "Planning", skills: 3, prompts: 2 },
    moveTo: null,
    onMoveToChange: () => {},
    moveToAdd: idleAdd,
    failure: null,
    busy: false,
    onDelete: () => {},
    onClose: () => {},
  },
} satisfies Meta<typeof DeleteCategoryDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WithItems: Story = {};

export const MovingToWriting: Story = { args: { moveTo: "Writing" } };

export const EmptyCategory: Story = {
  args: { category: { name: "Release notes", skills: 0, prompts: 0 } },
};

export const Failed: Story = {
  args: {
    failure: {
      level: "error",
      label: "Category not deleted",
      message: "Select Delete category to try again.",
    },
  },
};

export const Deleting: Story = { args: { busy: true } };
