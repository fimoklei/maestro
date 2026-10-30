import type { Meta, StoryObj } from "@storybook/react-vite";
import { RenameCategoryDialog } from "./rename-category-dialog";

const meta = {
  title: "Settings/RenameCategoryDialog",
  component: RenameCategoryDialog,
  args: {
    category: { name: "Planning", skills: 3, prompts: 2 },
    name: "Planning",
    onNameChange: () => {},
    error: undefined,
    failure: null,
    busy: false,
    onRename: () => {},
    onClose: () => {},
  },
} satisfies Meta<typeof RenameCategoryDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Unchanged: Story = {};

export const NameExists: Story = {
  args: { name: "writing", error: "Writing already exists." },
};

export const EmptyCategory: Story = {
  args: {
    category: { name: "release notes", skills: 0, prompts: 0 },
    name: "Release notes",
  },
};

export const Renaming: Story = { args: { name: "Design", busy: true } };
